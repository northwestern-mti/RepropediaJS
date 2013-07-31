/** 
 * NORTHWESTERN UNIVERSITY
 * Repropedia Standalone Client
 *
 * Author : Rodolfo B Vieira (rodolfo at northwestern.edu)
 * Date   : 6 May 2013
 *
 */

var Repropedia = Repropedia || (function($) {

  // public methods
  var exports = {};

  /*
   * Default Settings. Can be overriden by this class constructor via init({...});
   */
  var defaultSettings = {
    'webservice_url'    : 'http://www.repropedia.org',
    'api_url'           : 'api/1.0',
    'assets_url'        : 'sites/repropedia/client',
    'term_css_class'    : 'repropedia_term',
    'tooltip_css_class' : 'repropedia_tooltip'
  };

  /**
   * List of DOM selectors that contain repropedia terms.
   * Defined by the user. 
   */
  var regions = [];

  /**
   * OAUTH Consumer Token
   */
  var OAUTH_CONSUMER_KEY = null;

  /*
   * Settings. These can be overriden in this class 'constructor' .init({...});
   */
  var settings = {};
 
  /* 
   * Tagline for the tooltip. This will be displayed on the tooltip. 
   */
  var TAG_LINE = "Definition Provided by <a href='http://www.repropedia.org'>Repropedia</a> &copy; Northwestern University 2013";

  /* Strings used throughout
   * 
   */
  var STRINGS = {
    'NO_DOM_SELECTOR' : 'No DOM Selector was specified.',
    'ERROR_LOADING_TERM_LIST' : 'Error Loading List of Repropedia Terms'
  }

  /* Dictionary of all the keys for the dictionary of filetered words
   *  with the corresponding node id
   *
   */
  var dict = {};

  /*
   * Time in seconds to cache the RESTful service response. 
   * Caches: 
   *    - List of all terms
   *    - Definitions for the selected terms.
   */
  var TTL = 1800;
  /* Console logger - Helper function
   *   Doesn't block the script if the console is not available
  */

  /*
   * Log4js. Options: Log[WARN|DEBUG|ERROR]
   * ---------------------------------------
   * IN PRODUCTION: SET THE FIRST ARGUMENT TO: Log.ERROR
   * ---------------------------------------
   * Note; this is optional. If you want to use log4js.
   */
  var log;
  if (typeof Log === 'undefined'){
    var nop = function(_){};
    log = { 
       'debug' : nop,
       'warn' : nop,
       'error' : nop
    };
  } else {
    log = new Log(Log.DEBUG, Log.consoleLogger);
  } 


  /**
   * Get unix time in seconds.
   */
  var getUnixTime = function() {
    return parseInt(new Date().getTime()/1000);
  }

  /* Calls the webservice and gets a list of all the words with their
   * associated nodeid
   */
  var loadAllTerms = function() {
    log.debug("All terms");
    var urlParts = [];
    urlParts.push(settings['webservice_url']);
    urlParts.push(settings['api_url']);
    urlParts.push('term.jsonp');
    var url = urlParts.join('/');

    // Add OAUTH Consumer Key
    url+="?oauth_consumer_key="+OAUTH_CONSUMER_KEY;
    url+="&pagesize=99999";


    // checking localStorage cache
    var expiration = localStorage.getItem('repropedia_all_terms_expiration');
    expiration = parseInt(expiration);
    var now = getUnixTime();
    if (now < expiration) {
      // valid cache
      log.debug("  ALL TERMS Cache HIT");
      var cache_dict_serialized = localStorage.getItem('repropedia_all_terms_data');
      dict = JSON.parse(cache_dict_serialized);
      processTerms(dict);
    } else {
      // cache miss
      log.debug("  ALL TERMS Cache miss OR expired");

      // Make request
      $.ajax({
        url : url,
        type : 'GET',
        dataType : 'jsonp',
        success : function(resp, status, xhr) {
          handleResponseForAllTerms(resp);
          },
        error : function(xhr, status, error) {
          console.log(xhr);
          showError(error)
        }
      });
    }
  }


  /**
   * Trigger the tagging of known terms.
   */
  var processTerms = function(dict) {
    log.debug("Processing terms");
    filterTerms();
    addTooltips();
  }


  /* 
   * Callback for the Request to the list of All Terms 
   *
   */
   var handleResponseForAllTerms = function(data) {
    log.debug("  received response for all terms");
    dict = data;
    // write cache
    localStorage.setItem('repropedia_all_terms_expiration', getUnixTime() + TTL);
    localStorage.setItem('repropedia_all_terms_data', JSON.stringify(dict));
    processTerms(dict);
 }


  /* Generate HTML for the tooltip, with required classes
   * INPUT
   *   title - String 
   *   description - String
   * OUTPUT
   *   String - HTML to be displayed on the tooltip 
   */
  var generateTooltipContent = function(title, description) {
    var output = "";
    var base_url = settings['webservice_url'] + '/' + settings['assets_url'];
    var img_path = base_url + "/img/close-button.png";
    output+="<div class='label'>";
    output+=title;
    output+="</div>";
    output+="<div class='repro_description'>";
    output+=description;
    output+="</div>";
    output+="<div class='tagline'>"+TAG_LINE+"</div>";

    // only add the close button to touch devices
    if ('ontouchstart' in document.documentElement) {
      output+="<div class='closeBtn'><img src='"+img_path+"'></div";
    }
    return output;
  }

  /* Displays the message: loading 'word' on the tooltip, while waiting for
   * response from the Repropedia Web Service
   * INPUT
   *   term - string
   * OUTPUT
   *   string - formatted HTML for the tooltip 
   */
   var showLoaderForTerm = function(term)  {
    var title = "Looking for '" + term + "'..."; 
    var description=""; 
    var html = generateTooltipContent(title, description);
    updateTooltip(html);
  }


  /*
   * Updates the tooltip content and triggers the udpate display
   * INPUT
   *   Object with properties:
   *     .url - URL to the Repropedia Page with the Definition for the term.
   *     .title - The TERM
   *     .description - The TERM description.
   */
  var updateTooltipContent = function(term_definition) {
    // title for term
    var title = "<a href='"+term_definition.url+"'>"+term_definition.title+"</a>";

    // Decorate known terms in the definition. Inception-like.
    var description = term_definition.description;
    description = decorateBlob(description);

    // Generate tooltip content
    var html = generateTooltipContent(title, description);

    // update tooltip content
    updateTooltip(html);
  }

  /*
   *  Callback for the GET request to Repropedia
   */ 
   var showError = function(term) {
    log.debug("Term not found" + term);
    var title = "Couldn't find '" + term + "'.";
    var description = "";
    var output = generateTooltipContent(title, description);
    // update tooltip content
    updateTooltip(output);
  }

  // localStorage Cache helpers
  var makeTermID = function(nid) {
    return "repropedia_term_data_" + nid;
  } 
  var makeTermExpiration = function(nid) {
    return "repropedia_term_expiration_" + nid;
  }

    /*
   * Make a GET request to Repropedia for the definition of a term, based on the nid.
   * INPUT
   *   term - String, name of the term
   *   nid  - NUmber, node id from the Drupal Site. 
   */
  var requestDefinitionForTerm = function(term, nid) {
    var responseFormat = ".jsonp";
    var urlParts = [];
    urlParts.push(settings['webservice_url']);
    urlParts.push(settings['api_url']);
    urlParts.push('term');
    urlParts.push(nid);
    var url = urlParts.join('/') + responseFormat;

    // Add OAUTH Consumer Key
    url+="?oauth_consumer_key="+OAUTH_CONSUMER_KEY;
    url+="&pagesize=99999";

    log.debug("requestDef to "+url);
    showLoaderForTerm(term); 

    // search cache
    var term_id = makeTermID(nid);
    var term_expiration = makeTermExpiration(nid);
    var expiration = parseInt(localStorage.getItem(term_expiration));
    var now = getUnixTime();

    if (!isNaN(expiration) && (now < expiration)) {
      // cache HIT
      log.debug("  TERM cache hit");
      var cache_term_data = JSON.parse(localStorage.getItem(term_id));
      handleRepropediaResponseForTerm(cache_term_data);
    } else { 
      // cache MISS
      log.debug("  TERM cache miss");
      $.ajax({
        url : url,
        type : 'GET',
        dataType : 'jsonp',
        success : function(resp, status, xhr) {
          var title = chomp(resp.title);
          var nid = resp.nid;
          var url = resp.path;
          var description;
          
          // detect if there is a definition of redirect;       
          var synonym = resp['synonym'];
          var is_redirect = synonym.length >0;
          if (is_redirect) {
            log.debug("  Got a redirect");
            // find the term name for the redirect_nid;
            var redirect_nid = resp['field_term_synonym']['und'][0]['nid'];
            var REDIRECT_TEXT = "<br/>The definition for this term is located under: ";
            var redirect_term;
            for(var key in dict) {
              if (dict[key] == redirect_nid) {
                redirect_term = key;
                break;
              }
            }
            description = REDIRECT_TEXT + redirect_term;

          } else {
            // Get the definition
            log.debug("  Got Definition");
            description = resp.definition;
          }

          var content =  {
            title : title,
            nid: nid,
            url : url,
            description : description
          };

          // Cache response
          var term_id = makeTermID(content.nid);
          var term_expiration = makeTermExpiration(content.nid);
          var now = getUnixTime();
          localStorage.setItem(term_id, JSON.stringify(content));
          localStorage.setItem(term_expiration, now + TTL);

          // trigger processing
          handleRepropediaResponseForTerm(content);
       },
       error : function(xhr, status, error) {
         showError(term);
       }
     });
   }
  }



  /* 
   * Handle JSON of term definition from Repropedia Lexicon
   * INPUT 
   *   resp - String (json)
   */
   var handleRepropediaResponseForTerm = function(term_data) {
    // update tooltip with response content
    updateTooltipContent(term_data);
  }

  /*
   * Updates the Tooltip DOM Element with new HTML
   */
  var updateTooltip = function(html) {
    $('.' + settings['tooltip_css_class']).html(html);
  }

  var addTooltips = function() {
    $('.' + settings['term_css_class']).tooltip({
      tipClass : settings['tooltip_css_class'],
      offset: [10,20],
      effect: 'slide',
      events : {
        def : "click,mouseleave"
      },
      delay : 250
    })
    .dynamic({ bottom : {direction : 'down', bounce:true} })
    .live('click', function(e) {
      var nid = $(this).attr('nid');
      var word = $(this).text();        
      requestDefinitionForTerm(word, nid);   
    });
  }


  /*
   * Helper
   * Gets rid of white space at both sides of a string
   * INPUT 
   *   str : String
   * RETURNS
   *   str : String
   */
  var chomp = function(str) {
    return str.replace(/(\n|\r| )+$/, '');
  }


  /* 
   * Callback for text decoration. Wraps a word in to a <span/> element, with specific css class.
   * PARAMS
   *   term - String
   * RETURNS
   *   String - html
   */
   var decorateTerm = function(term) {
    var nid = dict[term];
    var css_class = settings['term_css_class'];
    return "<span class='"+css_class+"' nid='"+nid+"' title='$1'>$&</span>";
  }


  /* 
   * Decorate BLOB (text)
   * Finds every occurence of knwon words (dict) in the html, and decorates it HTML
   *
   * PARAMS 
   *   blob - String (text blob)
   * RETURNS
   *   String with known words wrapped in HTML.
   */
   var decorateBlob = function(blob) {
     log.debug(blob);
     log.debug("decorate blob");
     var text = ' ' + blob +' ';
     var tokenizer_regex = /(<[^>]*>)/i;
     var tokens = text.split(tokenizer_regex);

     var is_tracking = true;
     for(var i=0; i<tokens.length; i++) {
       // skip this non-lcosing tags
       if (tokens[i].match(/^<img/)) {
         continue;
       }
       log.debug(tokens[i]);
       // Tokens that disabled tracking
       if (tokens[i].match(/^<a/) || 
           tokens[i].match(/^<h/)) {
         is_tracking = false;
       } 

       // Tokens tha tre-enable tracking
       if (tokens[i].match(/^<\/a/) || 
           tokens[i].match(/^<\/h/)) {
         is_tracking = true;
       }

       if (is_tracking) {
         for(var term in dict) {
           var term_singular = term.replace(/s$/gi,'');
           var re = new RegExp('\\b' + term_singular + '[s]?\\b', 'gi');
           if (tokens[i].match(re)) {
             log.debug("  term found: "+term);
             replacement=decorateTerm(term);
             tokens[i]= tokens[i].replace(re, replacement);
           }
         }
       }
     }
     return tokens.join('');

  }

  /* 
   * Remove nested span class repropedia tags. 
   */
  var removeNestedTags = function(blob) {

     var text = ' ' + blob +' ';
     var tokenizer_regex = /(<[^>]*>)/i;
     var tokens = text.split(tokenizer_regex);

     var is_tracking = 0;
     for(var i=0; i<tokens.length; i++) {
       log.debug(tokens[i]);
       if (tokens[i].match(/^<span class='repropedia_term'([^>]*>)/i)) {
         is_tracking++;
       } 
       if (is_tracking>1) {
        tokens[i]= tokens[i].replace(/<span class='repropedia_term'([^>]*>)/i, "");
       };
       if (tokens[i].match(/^<\/span/) ) {
       if (is_tracking>1) {
        tokens[i]= tokens[i].replace("<\/span>", "");
       };
         is_tracking--;
       }

     }
     return tokens.join('');
  }

  /*
   *  Update Target DOM elements with known repropedia terms decorated with  
   *     the settings['repropedia_term'] css class. 
   */
  var filterTerms = function() {
    var regionsList = regions.join(',');
    $(regionsList).each(function() {
      $(this).html(removeNestedTags(decorateBlob($(this).html())));
    });
  }

  /*
   * Touch Event Handler - Trigger a mouseleave to dismiss the tooltip
   */
  var touchStart = function(e) {
    $(".tooltip").trigger('mouseleave');
  }
  var initTouchEvents = function() {
    $(".closeBtn").live('touchstart click', touchStart);
  }

  var reset = exports.reset = function(){
    localStorage.clear();
    dict = {};
    regions = [];
  }

  /*
   * Parse Settings in Options. Merge with defaultSettings
   */
  var parseSettings = function(opt) {
    for(key in defaultSettings) {
      settings[key] = opt[key] || defaultSettings[key];
    }
  }

    /*
   * Decorate - accepts and validates configuration
   * PARAMS
   *   options : Hash of options
   *   dom_selectors : Array of Strings, OR, String
   */
  var init = exports.init = function(options) {
    options = options || {};
    OAUTH_CONSUMER_KEY = options['CONSUMER_KEY'];
    parseSettings(options);
    var regionsTmp = options['regions'] ;
    regions = typeof regionsTmp === 'string' ? [regionsTmp] : regionsTmp;
    loadAllTerms();
    initTouchEvents();
  }

  return exports;

})(jQuery);
