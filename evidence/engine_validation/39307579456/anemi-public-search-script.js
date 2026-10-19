/*
 * General javascript container
 */


function pop_up_win (script, win_id) {
    pop_up_win_custom( script, win_id, 700, 940 );
}

function pop_up_win_custom (script, win_id, height, width) {
    window.open( script, win_id, 'width=' + width + ',height=' + height +
                 ',screenX=1,screenY=1,top=1,left=1,resizable=yes,' +
                 'scrollbars=1,scrolling=yes');
}


/* Extract some integer from the pdflib generated height and width - and
 * scale with individual factors to cope with unknown size of Acrobat's
 * panels, margins etc.
 */
function pdf_window_new (script,pageno,pagestart,maxpage, height, width) {
    height = extract_integer( height );
    width = extract_integer( width );

    height = Math.ceil( 1.25 * height );
    width = Math.ceil( 1.4 * width );

    s=script+'&lang='+lang+'&pageno='+pageno+'&pagestart='+pagestart;
    s=s+'&height='+height+'&width='+width+'&maxpage='+maxpage;
    pop_up_win_custom( s, 'anemi_pdf_viewer', height, width );
}

function pdf_window (script, height, width) {
    height = extract_integer( height );
    width = extract_integer( width );

    height = Math.ceil( 1.25 * height );
    width = Math.ceil( 1.4 * width );

    pop_up_win_custom( script, '', height, width );
}

function scan_tidy (form) {
    var f;
    for (i = 0; i < form.elements.length; i++) {
        f = form.elements[i].name;
        f = f.substring(0,7);
        if (f == 'cclterm') {
            f = search_term_tidy(form.elements[i].value);
            if (f.charAt(0) !== '"') {
                f = '"'+f;
            }
            if (f.charAt(f.length-1) !== '"') {
                f = f+'"';
            }
            form.elements[i].value=f;
        }
    }
    return true;
}

function search_tidy (form) {
    for (i = 0; i < form.elements.length; i++) {
        f = form.elements[i].name;
        f = f.substring(0,7);
        if (f == 'cclterm') {
            form.elements[i].value=search_term_tidy(form.elements[i].value);
        }
    }
    return true;
}

function search_term_tidy (str) {
    str = str.replace( /[&:!\.,;\[\]{}@#\$%<>\\()-]/g, ' ' );
    return str;
}


function extract_integer (str) {
    str = str.replace( /^\W+/, '' );
    str = str.replace( /\W+$/, '' );
    str = str.replace( /\..*/, '' );
    str = str.replace( /[^\d]+/, '' );

    return str;
}

function dsp (loc) {
    if ( document.getElementById ) {
        var foc=loc.firstChild;
        
        foc = loc.firstChild.innerHTML?
            loc.firstChild:
            loc.firstChild.nextSibling;
            
        imghtml = foc.innerHTML;
        pos = imghtml.indexOf('/gfx/');
        imghtml = imghtml.substring(0,pos+5);
        if (imghtml.indexOf('plus') >= 0) {
         foc.innerHTML=imghtml+'minus.gif" alt="-"/>&#xa0;';
        } else {
         foc.innerHTML=imghtml+'plus.gif" alt="+"/>&#xa0;';
        }

        foc = loc.parentNode.nextSibling.style ?
            loc.parentNode.nextSibling:
            loc.parentNode.nextSibling.nextSibling;
            
        foc.style.display=foc.style.display == 'block' ? 'none' : 'block';
    }
}


function check_all (name, obj) {
    var action;

    if ( !obj.state || ( obj.state == 'unchecked' ) ) {
        action = 'checked';
        obj.state = 'checked';
    } else {
        action = '';
        obj.state = 'unchecked';
    }

    cells = document.getElementsByName( name );

    for ( var i = 0; i < cells.length; i++ ) {
        cell = cells[i];
        cell.checked = action;
    }
}


function count_checked_cells (name) {
    var cells = document.getElementsByName( name );
    var count = 0;

    for ( var i = 0; i < cells.length; i++ ) {
        if ( cells[i].checked )
            count ++;
    }

    return count;
}


function set_action_submit (form, method, msg, msg2) {
    var session_count = count_checked_cells( 'session_keys[]' );
    var mysql_count = count_checked_cells( 'mysql_keys[]' );

    if ( session_count == 0 &&
         mysql_count == 0 ) {

        if (lang == "el") {
          alert( "Δεν έχετε επιλέξει τίποτα!" );
        } else {
          alert( "You haven't selected any!" );
        }
        return;
    }

    if ( method == 'email' ) {
        var email = form.email.value;
        form.email.value = (email.replace(/^\W+/,'')).replace(/\W+$/,'');

        if ( form.email.value == '' ) {
          if (lang == "el") {
            alert( 'Λάθος διεύθυνση' );
          } else {
            alert( 'Wrong email address' );
          }
          return;
        }

        form.annotation.value = prompt(msg2);
    }

    if ( confirm( msg ) ) {
        form.export_method.value = method;
        
        if ( method == 'print' ||
             method == 'download' ) {

            var old_action = form.action;

            pop_up_win( '', form.target = 'export');
            form.action = form.base_uri.value + '/php/export.php';
            form.submit();

            form.target = window.name;
            form.action = old_action;
            form.export_method.value = 'none';
        } else {
            form.submit();
        }
    }
}


function useradmin_submit (form, action, id, msg) {
    if ( action == 'delete' ) {
        if ( !confirm( msg ) )
           return;

        form.del_userid.value = id;
    } else if (  action == 'edit' ) {
        form.user_id.value = id;
    } else {
        alert( 'Unknown action: ' + action );
    }
    
    form.action.value = action;
    form.submit();
}


function ip_mask_action (form, id, action, text) {
    if ( action == 'update_lower' || action == 'update_upper' ) {
        var node_id = 'mask_' + id;

        if ( action == 'update_lower' )
            node_id += '_lower';
        else
            node_id += '_upper';

        data_node = document.getElementById( node_id );
        if ( data_node) {
            var old_value = data_node.innerHTML;
            old_value = old_value.replace(/^\W+<a[^>]*>(.*?)/,'');
            old_value = old_value.replace(/<\/a>\W+$/,'');

            if ( new_value = prompt( text, old_value ) ) {
                form.action.value = action;
                form.update_id.value = id;

                if ( action == 'update_lower' ) {
                    form.update_mask_lower.value = new_value;
                    form.update_mask_upper.value = '';
                } else {
                    form.update_mask_lower.value = '';
                    form.update_mask_upper.value = new_value;
                }

                form.submit();
            }
        } else {
            alert( 'Unable to find nodeid: ' + node_id );
        }
    } else if ( action == 'delete' ) {
        if ( confirm( text ) ) {
            form.action.value = action;
            form.delete_id.value = id;
            form.submit();
        }
    } else if ( action == 'add' ) {
        if ( new_value = prompt( text, '' ) ) {
            form.action.value = action;
            form.add_mask.value = '127.0.0.1';
            form.add_mask_name.value = new_value;
            form.submit();
        }
    } else if (action == 'category') {
        var node_id = 'cat_' + id;
        var data_node = document.getElementById(node_id)

        if (data_node) {
            form.action.value = 'update'; 
            form.update_id.value = id;
            form.category.value = data_node.value;
            form.submit();
        }
    } else {
        alert( 'Unknown action: ' + action );
    }
}


function confirm_clone (form, file, msg) {
    if ( confirm( msg ) ) {
        form.clone_file.value = file;
        form.submit();
    }
}


function update_show_hidden (field, form, go) {
    if ( field.checked ) {
        form.show_hidden.value = 1;
    } else {
        form.show_hidden.value = 0;
    }

    if ( go ) {
        form.submit();
    }
}



function update_action (form, action, msg) {
    if ( confirm( msg ) ) {
        form.action.value = action;
        form.submit();
    }
}


function update_date_field (obj, form, name) {
    var cell = form[name];
    
    if (obj.checked) {
        cell.removeAttribute('readonly');
        cell.style.background = 'white';
        cell.style.color = 'black';
    } else {
        cell.value = '';
        cell.setAttribute('readonly', 'readonly');
        cell.style.background = 'lightgrey';
        cell.style.color = 'grey';
    }
}


function get_form_field (form, field) {
    for (i = 0; i < form.elements.length; i++) {
        if (form.elements[i].name == field) {
            return form.elements[i];
        }
    }

    return 0;

}


function update_reference (doc, field_id, do_path) {
    form = doc.main;
    element = get_form_field(form, field_id);
    display_cell = doc.getElementById('hidden_' + field_id);
    display_cell.innerHTML = element.value = do_path;
    close();
}


function hier_delete (form, hier_del , msg) {
    if ( confirm(msg) ) {
        form.hier_delete.value = hier_del;
        form.submit();
    }

    return false;
}


function toggle_value (id) {
    var cell = document.getElementById(id);

    if (cell) {
        if (cell.value == 1) {
            cell.value = 0;
        } else {
            cell.value = 1;
        }
    } else {
        alert('Could not find cell id: ' + id);
    }
}

function toggle_display (obj) {
  obj.style.display=obj.style.display == 'block' ? 'none' : 'block';
}

function show_tab (base, no, max) {
var node_id;
var data_node;

 for (i = 1; i<=max; i++) {
   node_id = base + 'a' + i;
   data_node = document.getElementById( node_id );
   if (data_node) {
    if (i == no) {
     data_node.setAttribute("class", "mida single");
     data_node.setAttribute("className", "mida single");
    } else {
     data_node.setAttribute("class", "mid single");
     data_node.setAttribute("className", "mid single");
    }
   } else {
    alert(node_id+' not found');
   }
   node_id = base + i;
   data_node = document.getElementById( node_id );
   if (data_node) {
    if (i == no) {
     data_node.style.display='block';
    } else {
     data_node.style.display='none';
    }
   } else {
    alert(node_id+' not found');
   }
 }
}

function mkad(m) {
 var i = m.indexOf("_AT_");
 var loc = 'mailto:'+m.substr(0,i)+'@'+m.substr(i+4);
 window.location=loc;
}
/*
function showRecaptcha(element, submitButton, language) {

	if(language=='en'){
		Recaptcha.create("6Le7dQcAAAAAAJ1AbZX1rQ7AtXFKmQJy9N1u6xaD",""+ element +"",{
                        theme : 'red',
                        tabindex : 0,
                        callback: Recaptcha.focus_response_field
                });
	}
	else
        	Recaptcha.create("6Le7dQcAAAAAAJ1AbZX1rQ7AtXFKmQJy9N1u6xaD",element,{
        		custom_translations : { visual_challenge : "Οπτική Δοκιμασία",
        		audio_challenge : "Ακουστική Δοκιμασία",
        		refresh_btn : "Νέα Δοκιμασία",
        		instructions_visual : "Γράψτε τις δύο λέξεις:",
        		instructions_audio : "Γράψτε ό,τι ακούτε:",
        		help_btn : "Βοήθεια",
        		play_again : "Επανάληψη",
        		cant_hear_this : "Κατεβάστε τον ήχο ως MP3",
        		incorrect_try_again : "Λάθος. Προσπαθήστε ξανά."
        		},
       			theme : 'red',
       			tabindex : 0,
        		callback: Recaptcha.focus_response_field
        	});
        
	var buttons = document.getElementsByTagName("input"); 
        for (var i = 0; i < buttons.length; i++) { 
            type = buttons[i].getAttribute("type"); 
            if ( type == "submit") { 
              if ( buttons[i].style.visibility == "visible") { 
                buttons[i].style.visibility = "hidden"; 
              }
            }
        }
       	//document.getElementById('submit_button').style.visibility = "hidden";
      
	document.getElementById(submitButton).style.visibility = "visible";
	
}
*/

function showRecaptcha(filename, language) {
	grecaptcha.reset();
	document.getElementById('captcha_id').style.visibility = "visible";
        document.getElementById('error_captcha').innerHTML='';
	//document.getElementById('captcha_promt').style.visibility = "visible";
        document.getElementById('captcha_td').style.visibility = "visible";
        document.getElementById('submit_button_id').style.visibility = "visible";
	var loader = document.getElementById('dynamic_download');
	loader.innerHTML = '<div><form name="pdf_dump" target="_blank" action="'+tkl_docroot_portal+'/php/pdf_dump.php" method="post"><input type="hidden" name="filename" value="' + filename + '"/><input type="submit" style="visibility:hidden" name="go" id="hidden_download"/></form></div>';
	document.getElementById('submit_button_id').focus();
}

// Pre-load images -----------------------------

if (document.images){
  pic1 = new Image(220,19); 
  pic1.src = "/gfx/images/rating_loading.gif"; 

  pic2 = new Image(16,13); 
  pic2.src = "/gfx/images/rating_tick.gif";
  
  pic3 = new Image(14,14); 
  pic3.src = "/gfx/images/rating_warning.gif";
}

// AJAX ----------------------------------------

var uc_xmlHttp

function GetXmlHttpObject(){

var uc_xmlHttp = null;

  try {
    // Firefox, Opera 8.0+, Safari
    uc_xmlHttp = new XMLHttpRequest();
    }
  catch (e) {
    // Internet Explorer
    try {
      uc_xmlHttp = new ActiveXObject("Msxml2.XMLHTTP");
    }
    catch (e){
      uc_xmlHttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    }
    
  return uc_xmlHttp;

}

function usernamechk(username) {

  uc_xmlHttp = GetXmlHttpObject()
  
  if (uc_xmlHttp == null){
    alert ("Your browser does not support AJAX!");
    return;
  }

  uc_xmlHttp.onreadystatechange = function(){
    
    var loader = document.getElementById('validate_username');

    if (uc_xmlHttp.readyState == 4 && uc_xmlHttp.status == 200) {
      
      var xml = uc_xmlHttp.responseXML;
      //alert(xml);
      
      if (xml != null && xml.getElementsByTagName("username-check").item(0) != null) {

        var a = xml.getElementsByTagName("username-check").item(0);
        var status = xml.getElementsByTagName("status");
        if (status.item(0)) status_val = status.item(0).firstChild.nodeValue;

        if(status_val == 'exists'){

          if (lang == 'en') {
            loader.innerHTML = '<div class="usernamechk_warn">Username is not available!</div>';
          } else {
            loader.innerHTML = '<div class="usernamechk_warn">Μη διαθέσιμος κωδικός!</div>';
          }
        
        } else if(status_val == 'error') {

          var errormsg = xml.getElementsByTagName("errormsg");
          if (errormsg.item(0)) errormsg_val = errormsg.item(0).firstChild.nodeValue;
          loader.innerHTML = '<div class="usernamechk_warn">'+errormsg_val+'</div>';

        } else if(status_val == 'ok') {
        
          if (lang == 'en') {
            loader.innerHTML = '<div class="usernamechk_ok">Username available!</div>';
          } else {
            loader.innerHTML = '<div class="usernamechk_ok">Ο κωδικός είναι διαθέσιμος!</div>';
          }

        }
      }
    } else {
      loader.innerHTML = '<img src="/gfx/images/usernamechk_loading.gif" alt="loading" />';  
    }
  
  }

  var url = tkl_docroot_portal+"/php/usernamechk/username_check.php";
  var params = "username="+username;
  uc_xmlHttp.open("POST",url,true);
  uc_xmlHttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
  uc_xmlHttp.setRequestHeader("Accept","text/xml");
  uc_xmlHttp.setRequestHeader("Content-length", params.length);
  uc_xmlHttp.setRequestHeader("Connection", "close");
  uc_xmlHttp.send(params);
} 

function recaptchaValidate(error_captcha){
  responseField = grecaptcha.getResponse();

   var loader = document.getElementById('error_captcha');
   var html = $.ajax({
        type: "POST",
        url: tkl_docroot_portal+"/php/pdf_captcha.php",
        data: "recaptcha_response_field=" + responseField,
        async: false,
        success : function(data) {
                    if (data == "success")
                    {
	                 loader.innerHTML = '';
                         document.getElementById('hidden_download').click();
	                 document.getElementById('captcha_td').style.visibility='hidden';
	                 document.getElementById('captcha_id').style.visibility='hidden';
	                 document.getElementById('submit_button_id').style.visibility='hidden';
                         grecaptcha.reset();
                         return false;
                    }
                    else
                    {
                         loader.innerHTML = '<div class="recaptcha_warn">' + error_captcha + '</div>';
                         grecaptcha.reset();
	                 document.getElementById('submit_button_id').focus();
                         return false;
                    }
                  }

   });
   return false;
}

function check_fields(error_add, error_cap){
        var loader = document.getElementById('fromadd');
        if(loader.value==""){
                var loader = document.getElementById('error_fromadd');
                loader.innerHTML = '<div>' + error_add + '</div>';
        }
        else{
                responseField = grecaptcha.getResponse();

                var loader_captcha = document.getElementById('captcha_area');
                var html = $.ajax({
                        type: "POST",
                        url: tkl_docroot_portal+"/php/pdf_captcha.php",
                        data: "recaptcha_response_field=" + responseField,
                        async: false,
                        success : function(data) {
                                    if (data == "success")
                                    {
			                 loader = document.getElementById('error_captcha');
			                 loader.innerHTML = '<div><input type="submit" style="visibility:hidden" id="submit" name="submit"/></div>';
			                 document.getElementById('submit').click();
                                         grecaptcha.reset();
                                         return false;
                                    }
                                    else
                                    {
                                         loader = document.getElementById('error_captcha');
                                         loader.innerHTML = '<div>' + error_cap + '</div>';
                                         grecaptcha.reset();
                                         return false;
                                    }
                                  }
                });
        }
        return false;
}

$(function(){
    $('#alertdialog').dialog({
        autoOpen: false,
        draggable: false,
        resizable: false,
        position: ['center','center'],
        width: 450,
        height: 'auto',
        modal: true,
        zIndex: 1120,
        show: 'fade',
        hide: 'fade',
        buttons: [ { text : "OK", click: function() { $(this).dialog("close"); }  }  ]
    });
});

