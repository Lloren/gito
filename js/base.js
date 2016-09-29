"use strict"

var gaPlugin = false;
var storage_location = "";
var has_internet = false;
var uuid = "comp";
var ad_manager = false;
var thePlatform = "";
var localStorage;
var templates = {};

var last_touch = {x: 0, y:0, trigger:""};
function set_touch(e, trigger){
	var touch = e.originalEvent.changedTouches[0];
	last_touch.trigger = trigger;
	last_touch.x = touch.screenX;
	last_touch.y = touch.screenY;
}
function good_touch(e, trigger){
	var touch = e.originalEvent.changedTouches[0];
	
	if (Math.abs(last_touch.x - touch.screenX) < 10 && Math.abs(last_touch.y - touch.screenY) < 10 && trigger == last_touch.trigger){
		return true;
	}
	return false;
}

function click_event(limiter, callback, target){
	target = target || false;
	if (target){
		if (target === true)
			target = document;
		$(target).on("touchstart", limiter, function (e){
			set_touch(e, limiter);
		});
		$(target).on("touchend", limiter, function (e){
			if (!good_touch(e, limiter))
				return;
			callback(e);
		});
	} else {
		$(limiter).on("touchstart", function (e){
			set_touch(e, limiter);
		});
		$(limiter).on("touchend", function (e){
			if (!good_touch(e, limiter))
				return;
			callback(e);
		});
	}
}

function hide_keyboard() {
	//this set timeout needed for case when hideKeyborad
	//is called inside of 'onfocus' event handler
	setTimeout(function() {
		$(":focus").blur();
		//creating temp field
		var field = document.createElement('input');
		field.setAttribute('type', 'text');
		//hiding temp field from peoples eyes
		//-webkit-user-modify is nessesary for Android 4.x
		field.setAttribute('style', 'position:absolute; top: 0px; opacity: 0; -webkit-user-modify: read-write-plaintext-only; left:0px;');
		document.body.appendChild(field);
		//adding onfocus event handler for out temp field
		field.onfocus = function(){
			//this timeout of 200ms is nessasary for Android 2.3.x
			setTimeout(function() {
				field.setAttribute('style', 'display:none;');
				setTimeout(function() {
					document.body.removeChild(field);
					document.body.focus();
				}, 14);
			}, 200);
		};
		//focusing it
		field.focus();
	}, 50);
}

function dump(obj, name, pre, depth, ret){
	ret = ret || false;
	pre = pre || "";
	name = name || "";
	depth = typeof depth !== "undefined" ? depth : 2;
	var out = "";
	if (typeof obj == "object" && depth > 0){
		var prop = false;
		for (var i in obj) {
			prop = true;
			out += dump(obj[i], name, pre+"["+i+"] ", depth-1, ret);
		}
		if (prop)
			return out;
		else
			out = "{}";
	} else {
		out += pre + (typeof obj) + ": " + obj;
	}
	if (ret)
		return name+"; "+out;
	console.log(name+"; "+out);
}

function ret_dump(obj, depth){
	depth = typeof depth !== "undefined" ? depth : 1;
	return dump(obj, "", "", depth, true);
}

function argdump(){
	for (var i = 0; i < arguments.length; ++i)
		alert(ret_dump(arguments[i]));
}

function template(key, data){
	var dat = templates[key];
	for(var key in data){
		dat = dat.replace(new RegExp("##"+key+"##", 'g'), data[key]);
		dat = dat.replace(new RegExp("{{"+key+"\\?([^}]*)}}", 'gm'), "$1");
	}
	dat = dat.replace(new RegExp("{{[^}]*}}", 'gm'), "");
	return dat;
}

function open_modal(options){
	options = $.extend({}, {content: "", title: "", callback: false, button1: "Ok", button2: false, overwrite: true}, options || {});
	if (options.button2 === true)
		options.button2 = "Cancel";
	
	$("#modal h1").html(options.title);
	if (options.overwrite || !$("#modal").is(":visible")){
		$("#modal p").html(options.content);
	} else {
		$("#modal p").append("<br />"+options.content);
	}
	$("#mbutton1").html(options.button1);
	if (options.button2){
		$("#mbutton1").removeClass("fullwidth");
		$("#mbutton2").show().html(options.button2);
	} else {
		$("#mbutton1").addClass("fullwidth");
		$("#mbutton2").hide();
	}
	$("#modal a").off().on("touchend", function (e){
		$("#modal").hide();
		$("#disable-overlay").removeClass("enabled modal");
		if (options.callback)
			options.callback($(this).html());
	});
	$("#modal").show();
	$("#disable-overlay").addClass("enabled modal");
}

function open_modala(text){
	$("#modal h1").html(text);
	$("#modal").addClass("loading").show();
	$("#disable-overlay").addClass("enabled modal");
}

function close_modala(){
	$("#modal").hide().removeClass("loading");
	$("#disable-overlay").removeClass("enabled modal");
}

function track(catigory, action, label, value){
	if (gaPlugin){
		catigory = catigory || "Hit";
		action = action || catigory;
		label = label || action;
		value = value || 1;
		gaPlugin.trackEvent(false, false, catigory, action, label, value);
	}
}

var splash_checks = 2;
function start_splash_remove(){
	--splash_checks;
	if (splash_checks <= 0){
		setTimeout(function () { navigator.splashscreen.hide(); }, 100);
	}
}



function iads(){
	var scope = this;
	this.available = (thePlatform == "ios" && window.plugins.iAd);
	this.loaded = false;
	this.failed_at = 0;
	this.active = false;
	this.priority = 1;

	this.init = function(){
		if (!this.loaded){
			this.loaded = true;
			window.plugins.iAd.createBannerView({
				'bannerAtTop': false,
				'overlap': false,
				'offsetTopBar': false
			}, function(){
				scope.dshow();
			}, function(){
				scope.failed_at = new Date().getTime();
				ad_manager.ad_fail("iads");
			});
			document.addEventListener("onFailedToReceiveAd", function(ret){
				scope.failed_at = new Date().getTime();
				ad_manager.ad_fail("iads");
			}, false);
			document.addEventListener("onReceiveAd", function(){
				if (!ad_manager.hide_others("iads")){
					scope.hide();
				}
				scope.dshow();
			}, false);
		} else {
			this.dshow();
		}
	};

	this.dshow = function (){
		var s = this;
		setTimeout(function (){
			s.show();
		}, 1000);
	};

	this.show = function(){
		if (this.priority <= ad_manager.pri_active && !this.active){
			ad_manager.pri_active = this.priority;
			window.plugins.iAd.showAd(true);
			this.active = true;
			setTimeout(function (){
				$(window).trigger('resize');
			}, 1000);
		}
	};

	this.hide = function(){
		if (this.active){
			ad_manager.pri_active = 999;
			this.active = false;
			window.plugins.iAd.showAd(false);
		}
	};
}

function admob(){
	var scope = this;
	this.available = typeof AdMob != "undefined";
	this.loaded = false;
	this.failed_at = 0;
	this.active = false;
	this.priority = 2;

	this.init = function(){
		if (!this.loaded){
			this.loaded = true;
			var code = admob_code;
			if (typeof admob_code_droid != "undefined" && thePlatform == "android")
				code = admob_code_droid;
			AdMob.createBanner({
				adId: code,
				adSize: 'SMART_BANNER',
				position: AdMob.AD_POSITION.BOTTOM_CENTER,
				autoShow: false,
				isTesting: dev,
				adExtras: {color_bg: '333333'}
			});

			document.addEventListener('onAdFailLoad', function(data) {
				scope.failed_at = new Date().getTime();
				ad_manager.ad_fail("AdMob");
			});
			document.addEventListener('onAdLoaded', function(data){
				if (!ad_manager.hide_others("AdMob")){
					scope.hide();
				}
				scope.dshow();
			});
		} else {
			this.dshow();
		}
	};

	this.dshow = function (){
		var s = this;
		setTimeout(function (){
			s.show();
		}, 1000);
	};

	this.show = function(){
		if (this.priority <= ad_manager.pri_active && !this.active){
			ad_manager.pri_active = this.priority;
			this.active = true;
			AdMob.showBanner(AdMob.AD_POSITION.BOTTOM_CENTER);
			setTimeout(function (){
				$(window).trigger('resize');
			}, 1000);
		}
	};

	this.hide = function(){
		if (this.active){
			ad_manager.pri_active = 999;
			this.active = false;
			AdMob.hideBanner();
		}
	};
}

function house_ads(){
	this.available = false;
	this.loaded = false;
	this.failed_at = 0;
	this.active = false;
	this.priority = 3;

	this.init = function(){
		if (!this.loaded) {
			this.loaded = true;
		} else {
			this.show();
		}
	};

	this.dshow = function (){
		var s = this;
		setTimeout(function (){
			s.show();
		}, 5000);
	};

	this.show = function(){
	};

	this.hide = function(){
	};
}

function admanager() {
	this.ads = {"iads": new iads(), "AdMob": new admob(), "house": new house_ads()};
	this.pri_active = 999;

	this.init = function(){
		for (var key in this.ads){
			if (this.ads[key].available){
				this.ads[key].init();
				break;
			}
		}
	};

	this.ad_fail = function(who){
		this.ads[who].hide();
		for(var key in this.ads){
			if (key != who && this.ads[key].available && this.ads[key].failed_at < (new Date()).getTime()-100000){
				this.ads[key].init();
				break;
			}
		}
	};

	this.hide_others = function(who){
		if (this.ads[who].priority <= this.pri_active){
			for(var key in this.ads){
				if (key != who && this.ads[key].available){
					this.ads[key].hide();
					break;
				}
			}
			return true;
		} else {
			return false;
		}
	};
}

function on_ready(){
	console.log("pre_ready");
	setTimeout(function (){
		console.log("ready_run");
		thePlatform = "";
		$("#templates>div").each(function (i, data){
			templates[$(data).data("key")] = $(data).html();
		});
		$("#templates").remove();
		alert(ret_dump(device));
		if (typeof device != 'undefined'){
			navigator.splashscreen.show();
			thePlatform = device.platform.toLowerCase();

			localStorage = window.localStorage;

			gaPlugin = window.plugins.gaPlugin;

			gaPlugin.init(false, false, dev?"":ga_code, 10);
			track("Load", "load");

			has_internet = navigator.connection.type != Connection.NONE;

			if(ads){
				ad_manager = new admanager();
				ad_manager.init();
			}

			start_splash_remove();

			document.body.className = "v"+device.version.substr(0, 1)+" version"+device.version.replace(/\./g, "_");

			uuid = device.uuid;

			//if (fb_app_id)
			//	FB.init({appId: fb_app_id, nativeInterface: CDV.FB, useCachedDialogs: false});
		} else {
			thePlatform = "non-gap";
			has_internet = true;
			if (fb_app_id){
				$("body").prepend('<div id="fb-root"></div><script>(function(d, s, id) {var js, fjs = d.getElementsByTagName(s)[0];if (d.getElementById(id)) return;js = d.createElement(s); js.id = id;js.src = "//connect.facebook.net/en_US/sdk.js#xfbml=1&appId='+fb_app_id+'&version=v2.0";fjs.parentNode.insertBefore(js, fjs);}(document, "script", "facebook-jssdk"));</script>');
			}
		}
		if (thePlatform == "android"){
			document.body.id = "android";
		} else if (thePlatform == "wince"){
			document.body.id = "win";
		} else if (thePlatform == "non-gap"){
			document.body.id = "non-gap";
		} else if (thePlatform == "ios"){
			document.body.id = "ios";
			uuid = window.localStorage.getItem("set_uuid");
			if (uuid === null){
				uuid = device.uuid;
				window.localStorage.setItem("set_uuid", uuid);
			}
		}
		if (typeof startup === "function")
			startup();
	}, 1);
}

function online_check(){
	if (has_internet){
		return true;
	} else {
		open_modal({title: "Notice<i class='fa fa-info-circle'></i>", content: "Internet access is required for this action."});
		return false;
	}
}

function onLoad(){
	document.addEventListener("deviceready", on_ready, false);
	document.addEventListener("online", function (){
		has_internet = navigator.connection.type != Connection.NONE;
	}, false);
	document.addEventListener("offline", function (){
		has_internet = navigator.connection.type != Connection.NONE;
	}, false);
	start_splash_remove();
}

function onunload(){
	track("Close", "close");
	if (gaPlugin) {
		gaPlugin.exit(false, false);
	}
}

$(function () {
	Origami.fastclick(document.body);
	if (typeof window.cordova == "undefined")
		on_ready();
});