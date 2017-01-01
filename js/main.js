"use strict";

var map;
var geocoder;
var bounds;
var markers = {};
var my_loc = false;
var full_bounds = false;
var user_moved_map = false;

var DirectionsService;
var from_autocomplete;
var to_autocomplete;
var from_blur_handel = false;
var to_blur_handel = false;

var run_handel = false;

var transit_holder = [];

var results_call = 0;
var results_to_return = 4;

//"https://play.google.com/store/apps/details?id=me.lyft.android";
var backup_links = {"lyft": {"android": "market://details?id=me.lyft.android", "android_package": "me.lyft.android", "ios": "https://itunes.apple.com/us/app/lyft-taxi-bus-app-alternative/id529379082"}, "uber": {"android": "market://details?id=com.ubercab", "android_package": "com.ubercab", "ios": "https://itunes.apple.com/us/app/lyft-taxi-bus-app-alternative/id368677368"}};

function Settings(){
	this.data = JSON.parse(window.localStorage.getItem("settings_data") || '{"sort":"price","show_external_conf":true,"full_map_settings":true}');

	this.set = function (key, val){
		this.data[key] = val;
		window.localStorage.setItem("settings_data", JSON.stringify(this.data));
	};

	this.get = function (key){
		return this.data[key];
	};
}
window.settings = new Settings();

function get_origin_geo(callback){
	var ret = $("#from_loc").val().toLowerCase();
	if (ret == "my location" && my_loc){
		$("#from_loc").next().show();
		callback({lat: my_loc.lat(), lng: my_loc.lng()}, true);
		if ($("#to_loc").val() == ""){
			map.panTo(my_loc);
		}
	} else if (ret != ""){
		$("#from_loc").next().show();
		var cache = localStorage.getItem("location:"+ret);
		if (cache){
			console.log("Cache hit: location:"+ret);
			callback(JSON.parse(cache), true);
			return;
		}
		geocoder.geocode({bounds: map.getBounds(), address: ret}, function (results, status){
			if (status == "OK"){
				//localStorage.setItem("location:"+ret, JSON.stringify(results[0].geometry.location));
				callback({lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng()}, true);
			} else {
				callback(false, true);
			}
		});
	} else {
		$("#from_loc").next().hide();
		callback(false, true);
	}
}

function get_destination_geo(callback){
	var ret = $("#to_loc").val().toLowerCase();
	if (ret != ""){
		$("#to_loc").next().show();
		var cache = localStorage.getItem("location:"+ret);
		if (cache){
			console.log("Cache hit: location:"+ret);
			callback(JSON.parse(cache));
			return;
		}
		geocoder.geocode({bounds: map.getBounds(), address: ret}, function (results, status){
			if (status == "OK"){
				//localStorage.setItem("location:"+ret, JSON.stringify(results[0].geometry.location));
				callback({lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng()});
			} else {
				callback(false);
			}
		});
	} else {
		$("#to_loc").next().hide();
		callback(false);
	}
}

function service_google(call_num, start, stop){
	DirectionsService.route({origin: start, destination: stop, travelMode:"TRANSIT", provideRouteAlternatives: true}, function (response, status){
		if (results_call > call_num)
			return;
		//console.log(JSON.stringify(response));
		console.log("google transit route results", status, response);
		var results = [];
		if (markers.google_routs){
			for (var i=0;i<markers.google_routs.length;i++){
				markers.google_routs[i].setMap(null);
			}
		}
		markers.google_routs = [];
		transit_holder = [];
		var bounds = new google.maps.LatLngBounds();
		if (status == "OK"){
			for (var i = 0; i < response.routes.length; i++){
				var route = response.routes[i];
				var msec = 0;
				if (typeof route.legs[0].departure_time == "undefined")
					continue;
				msec = new Date(route.legs[0].departure_time.value).getTime() - new Date().getTime();
				var obj = {
					icon:'<img src="images/icons3/CUSTOM%20BUS%20ICON.RO.v9.svg">',
					name:"Walk",
					price:" ---",
					time:"N/A"
				};
				if (route.fare && route.fare.value)
					obj.price = route.fare.value;
				obj.time_sec = Math.ceil(msec / 1000);
				var path = new google.maps.Polyline({
					path:route.overview_path,
					geodesic:true,
					strokeColor:'#3366CC',
					strokeOpacity:0.6,
					strokeWeight:5,
					map:map,
					zIndex:2
				});
				markers.google_routs.push(path);
				route.overview_path.forEach(function(e){
					bounds.extend(e);
				});
				obj.route_id = markers.google_routs.length;
				obj.transit_info = transit_holder.length;
				var num = 0;
				var has_name = false;
				for (var j=0;j<route.legs[0].steps.length;j++){
					var step = route.legs[0].steps[j];
					if (step.transit){
						num++;
						if (!has_name){
							has_name = true;
							obj.name = step.transit.line.vehicle.name+" "+step.transit.line.short_name;
							if (step.transit.line.vehicle.name == "Train"){
								obj.name = step.transit.line.agencies[0].name + " " + step.transit.line.name;
							}
						}
					}
				}
				if (num > 1){
					obj.name += " (+"+(num-1)+")";
				}
				transit_holder.push(route.legs[0]);
				results.push(obj);
			}
			map.panTo(bounds.getCenter());
			google.maps.event.addListenerOnce(map, 'idle', function(){
				map.fitBounds(bounds);
			});
			returned_results(results, "Transit");
		}
		DirectionsService.route({origin: start, destination: stop, travelMode:"DRIVING"}, function (response, status){
			console.log("google driving route results", status, response);
			var bounds = new google.maps.LatLngBounds();
			if (status == "OK"){
				for (var i=0;i<response.routes.length;i++){
					var route = response.routes[i];
					var path = new google.maps.Polyline({
						path:route.overview_path,
						geodesic:true,
						strokeColor:"#777777",
						strokeOpacity:1.0,
						strokeWeight:8,
						map:map,
						zIndex:1
					});
					markers.google_routs.push(path);
					route.overview_path.forEach(function(e){
						bounds.extend(e);
					});
					break;
				}
			} else {
				bounds.extend(start);
				bounds.extend(stop);
				open_modal({title: "error", content:"No driving rout between locations."});
			}
			map.panTo(bounds.getCenter());
			google.maps.event.addListenerOnce(map, 'idle', function() {
				map.fitBounds(bounds);
			});
			full_bounds = bounds;
		});
	});
}

function service_uber(call_num, start, stop){
	$.getJSON(base_url+"/ajax/uber.php", {start_latitude: start.lat, start_longitude: start.lng, end_latitude: stop.lat, end_longitude: stop.lng}, function (data){
		if (results_call > call_num)
			return;
		var results = [];
		for (var i=0;i<data.length;i++){
			var price = data[i];
			var obj = {app: "uber", icon: '<img src="images/uber_'+price.localized_display_name.toLowerCase().replace(" ", "_")+'.svg" onError="this.onerror=null;this.src='+"'images/uber_logo.svg'"+';">', name: price.localized_display_name, price_multiply: price.surge_multiplier, time_sec: price.time_estimate};
			if (price.surge_multiplier > 1)
				obj.show_surge = true;
			if (price.estimate[0] == "$"){
				var pdata = price.estimate.substr(1);
				if (pdata.indexOf("-") >= 0){
					pdata = pdata.split("-");
					obj.price_min = pdata[0];
					obj.price_max = pdata[1];
				} else {
					obj.price = pdata;
				}
			} else {
				obj.price_min = 999999;
				obj.price = price.estimate;
			}
			obj.dlink = "uber://?client_id=YOUR_CLIENT_ID&action=setPickup&pickup[latitude]="+start.lat+"&pickup[longitude]="+start.lng+"&pickup[nickname]="+encodeURI($("#from_loc").val())+"&dropoff[latitude]="+stop.lat+"&dropoff[longitude]="+stop.lng+"&dropoff[nickname]="+encodeURI($("#to_loc").val())+"&product_id="+price.product_id+"&link_text=Transportation-Helper&partner_deeplink=Mooky";
			results.push(obj);
		}
		returned_results(results, "Uber");
	});
}

function service_tff(call_num, start, stop){
	$.ajax({
		dataType: "jsonp",
		cache: true,
		url: "https://api.taxifarefinder.com/fare?callback=?",
		data: {origin: start.lat+","+start.lng, destination: stop.lat+","+stop.lng, key: "bREfab7g3fEp"},
		success: function (data){
			if (results_call > call_num)
				return;
			if (data.status == "OK"){
				returned_results([{icon: '<img src="images/icons3/CUSTOM%20TAXI%20ICON.RO.v6.svg">', name: "Taxi", price: data.total_fare, tff:true}]);
			}
		}
	});
}

function tff_numbers(loc, callback){
	$.ajax({
		dataType: "jsonp",
		cache: true,
		url: "https://api.taxifarefinder.com/entity?callback=?",
		data: {key: "bREfab7g3fEp", location: loc.lat+","+loc.lng},
		success: function (data){
			if (data.handle){
				$.ajax({
					dataType: "jsonp",
					cache: true,
					url: "https://api.taxifarefinder.com/businesses?callback=?",
					data: {key: "bREfab7g3fEp", entity_handle: data.handle},
					success: function (data){
						if (data.status == "OK"){
							callback(data.businesses);
						}
					}
				});
			}
		}
	});
}

var lyft_token = false;
var lyft_eta_data = false;
var lyft_cost_data = false;

function process_lyft(call_data){
	if (lyft_eta_data && lyft_cost_data){
		var etas = {};
		for (var i=0;i<lyft_eta_data.eta_estimates.length;i++){
			var eta = lyft_eta_data.eta_estimates[i];
			etas[eta.ride_type] = eta.eta_seconds;
		}
		var results = [];
		for (var i=0;i<lyft_cost_data.cost_estimates.length;i++){
			var est = lyft_cost_data.cost_estimates[i];
			var surge_multi = est.primetime_percentage.substr(0, est.primetime_percentage.length-1)/100 + 1;
			var obj = {app: "lyft", icon: '<img src="images/lyft_'+est.display_name.toLowerCase().replace(" ", "_")+'.svg" onError="this.onerror=null;this.src='+"'images/lyft_logo.svg'"+';">', name: est.display_name, time_sec: etas[est.ride_type]?etas[est.ride_type]:"N/A", price_multiply: surge_multi};
			if (surge_multi > 1)
				obj.show_surge = true;
			if (est.estimated_cost_cents_max > 0){
				if (est.estimated_cost_cents_min == est.estimated_cost_cents_max){
					obj.price = est.estimated_cost_cents_min/100;
				} else {
					obj.price_min = Math.floor(est.estimated_cost_cents_min/100);
					obj.price_max = Math.ceil(est.estimated_cost_cents_max/100);
				}
			} else {
				obj.price = " ---";
				obj.price_min = 999999;
			}
			obj.dlink = "lyft://ridetype?id="+est.ride_type+"&pickup[latitude]="+call_data.start_lat+"&pickup[longitude]="+call_data.start_lng+"&destination[latitude]="+call_data.end_lat+"&destination[longitude]="+call_data.end_lng;
			results.push(obj);
		}
		returned_results(results, "Lyft");
	}
}

function service_lyft(call_num, start, stop){
	if (lyft_token){
		lyft_cost_data = false;
		lyft_eta_data = false;
		var  call_data = {start_lat: start.lat, start_lng: start.lng, end_lat: stop.lat, end_lng: stop.lng};
		$.ajax({
			url: "https://api.lyft.com/v1/cost",
			data: call_data,
			beforeSend: function (xhr) {
				xhr.setRequestHeader ("Authorization", "bearer "+lyft_token);
			}, success: function (data){
				if (results_call > call_num)
					return;
				lyft_cost_data = data;
				process_lyft(call_data);
			}
		});
		$.ajax({
			url: "https://api.lyft.com/v1/eta",
			data: {lat: start.lat, lng: start.lng},
			beforeSend: function (xhr) {
				xhr.setRequestHeader ("Authorization", "bearer "+lyft_token);
			}, success: function (data){
				if (results_call > call_num)
					return;
				lyft_eta_data = data;
				process_lyft(call_data);
			}
		});
	} else {
		$.ajax({
			url: "https://api.lyft.com/oauth/token",
			method: "POST",
			headers: {"Content-Type": "application/json"},
			data: '{"grant_type": "client_credentials", "scope": "public"}',
			beforeSend: function (xhr) {
				xhr.setRequestHeader ("Authorization", "Basic " + btoa("e0oOEZLBvuIY:kjxPaadYnuw3XnyGLZ8ceDfPfuLm2YEg"));
			}, success: function (data){
				lyft_token = data.access_token;
				service_lyft(call_num, start, stop);
			}
		});
	}
}

function returned_results(results, over_name){
	--results_to_return;
	if (results_to_return <= 0){
		minify_rout();
	}
	if (results){
		if (results.length > 1){
			var over_result = {};
			over_result.sub_results = format_results(results);
			over_result.name = over_name + " ("+results.length+")";
			over_result.icon = '<img src="images/'+over_name.toLowerCase()+'_logo.svg">';
			$("#results").append(template("overload_result", over_result));
		} else {
			$("#results").append(format_results(results));
		}
		sort_results();
	}
}

function format_results(results){
	var html = [];
	for (var i=0;i<results.length;i++){
		var result = results[i];
		if (result.time_sec)
			result.time = Math.ceil(result.time_sec/60) + " min";
		if (!result.time){
			result.time = "N/A";
			result.time_sec = 999999;
		}
		if (result.price_min){
			if (!result.price){
				result.price = "$"+result.price_min + " - " + result.price_max;
			}
		} else {
			result.price_min = result.price;
			result.price = "$"+result.price;
		}
		if (result.trasit_info){

		}
		html.push(template("result", result));
	}
	return html.join("");
}

function sort_results(){
	console.log("sorting");
	var sorter = settings.get("sort");

	$(".sub_results").each(function (){
		var t = $(this);
		var result = t.children(".result").sort(function (a, b){
			return $(a).data(sorter) - $(b).data(sorter);
		});
		t.append(result);
		var top = t.children(".result").first();
		var par = t.parent();
		par.data(sorter, top.data(sorter));
		var main_res = par.children(".result");
		main_res.find(".price").html(top.children(".price").html());
		main_res.find(".time").html(top.children(".time").html());
	});

	var result = $("#results > .result, #results > .result_group").sort(function (a, b){
		return $(a).data(sorter) - $(b).data(sorter);
	});
	$("#results").append(result);
}

function geo_location(id, geo){
	geocoder.geocode({location: geo}, function (results, status){
		if (status == "OK"){
			//localStorage.setItem("location:"+results[0].formatted_address, JSON.stringify(geo));
			console.log("geo results", id, results);
			$(id).val(results[0].formatted_address).next().show();
		}
	});
}

var start_location = false;
var stop_location = false;
function coded_location(pos, start, trigger){
	console.log("coded location", pos, start, trigger);
	if (!pos){
		return;
	} else if (start){
		start_location = pos;
		if (markers.start){
			markers.start.setPosition(start_location);
		} else {
			markers.start = new google.maps.Marker({
				position: start_location,
				map: map,
				draggable: true,
				zIndex: 10,
				icon: {
					url:"images/icons3/CUSTOM%20DESTINATION%20ICON.WB.v21.svg",
					size: new google.maps.Size(10, 10),
					origin: new google.maps.Point(0, 0),
					anchor: new google.maps.Point(5, 5)
				}
			});
			markers.start.addListener("dragend", function (event){
				start_location = {lat: event.latLng.lat(), lng: event.latLng.lng()};
				geo_location("#from_loc", event.latLng);
				if (stop_location){
					run_services();
				}
			});
			if (trigger){
				geo_location("#from_loc", start_location);
			}
		}
	} else {
		stop_location = pos;
		if (markers.stop){
			markers.stop.setPosition(stop_location);
		} else {
			markers.stop = new google.maps.Marker({
				position:stop_location,
				map:map,
				draggable:true,
				zIndex: 20,
				icon: {
					url: "images/icons3/CUSTOM%20ORIGIN%20ICON.BW.v9.svg",
					size: new google.maps.Size(10, 10),
					origin: new google.maps.Point(0, 0),
					anchor: new google.maps.Point(5, 5)
				}
			});
			markers.stop.addListener("dragend", function(event){
				stop_location = {lat:event.latLng.lat(), lng:event.latLng.lng()};
				geo_location("#to_loc", event.latLng);
				if (start_location){
					run_services();
				}
			});
			if (trigger){
				geo_location("#to_loc", stop_location);
			}
		}
	}
	if (start_location && stop_location){
		run_services();
	}
}

function run_services(){
	console.log("run_services", run_handel);
	if (!run_handel){
		run_handel = setTimeout(function (){
			console.log("runing_services", start_location, stop_location);
			if (start_location && stop_location){
				$("#search_animation").show();
				$("#results_tab_handle").show();
				++results_call;
				bounds = new google.maps.LatLngBounds();
				bounds.extend(new google.maps.LatLng(start_location));
				bounds.extend(new google.maps.LatLng(stop_location));
				map.panTo(bounds.getCenter());
				google.maps.event.addListenerOnce(map, "idle", function() {
					map.fitBounds(bounds);
				});
				$("#results").html("");
				results_to_return = 4;
				service_google(results_call, start_location, stop_location);
				service_uber(results_call, start_location, stop_location);
				service_tff(results_call, start_location, stop_location);
				service_lyft(results_call, start_location, stop_location);
			} else {
				open_modal({title: "error", content:"You need to enter a from and to location."});
			}
			run_handel = false;
			hide_keyboard();
		}, 1);
	}
}

function get_services(){
	console.log("get_services");
	get_origin_geo(coded_location);
	get_destination_geo(coded_location);
}

function latLng2Point(latLng, map) {
	var topRight = map.getProjection().fromLatLngToPoint(map.getBounds().getNorthEast());
	var bottomLeft = map.getProjection().fromLatLngToPoint(map.getBounds().getSouthWest());
	var scale = Math.pow(2, map.getZoom());
	var worldPoint = map.getProjection().fromLatLngToPoint(latLng);
	return new google.maps.Point((worldPoint.x - bottomLeft.x) * scale, (worldPoint.y - topRight.y) * scale);
}

function point2LatLng(point, map) {
	var topRight = map.getProjection().fromLatLngToPoint(map.getBounds().getNorthEast());
	var bottomLeft = map.getProjection().fromLatLngToPoint(map.getBounds().getSouthWest());
	var scale = Math.pow(2, map.getZoom());
	var worldPoint = new google.maps.Point(point.x / scale + bottomLeft.x, point.y / scale + topRight.y);
	return map.getProjection().fromPointToLatLng(worldPoint);
}

function minify_rout(pow){//turned off, remove if determined to not use
	return;
	pow = pow || 1;
	var lat1 = map.getBounds().getNorthEast().lat();
	var lat2 = map.getBounds().getSouthWest().lat();
	var lat3 = lat2 - (lat1 - lat2)*pow;
	var bounds = map.getBounds();
	bounds.extend(new google.maps.LatLng({lat: lat3, lng: map.getBounds().getNorthEast().lng()}));
	map.fitBounds(bounds);
	/*setTimeout(function (){
	 map.setZoom(map.getZoom()+1);
	 }, 1);*/
}

function full_rout(){//turned off, remove if determined to not use
	return;
	if (full_bounds)
		map.fitBounds(full_bounds);
}

function load_map(){
	console.log("load_map");

	var options = {
		zoom: 13,
		disableDefaultUI: true
	};
	if (my_loc){
		options.center = my_loc;
		if (!markers.my_loc){
			options.zoom = 10;
			my_loc = false;
		}
	} else {
		options.center = new google.maps.LatLng(40.4921722, -98.1900234);
		options.zoom = 5;
	}
	DirectionsService = new google.maps.DirectionsService();
	map = new google.maps.Map(document.getElementById("map-canvas"), options);
	geocoder = new google.maps.Geocoder();

	map.addListener("click", function (event){
		if (!markers.start){
			console.log("click no start marker");
			coded_location({lat: event.latLng.lat(), lng: event.latLng.lng()}, true, true);
			$("#from_loc").next().show();
		} else if (!markers.stop){
			console.log("click no stop marker");
			coded_location({lat: event.latLng.lat(), lng: event.latLng.lng()}, false, true);
			$("#to_loc").next().show();
		}
	});

	$(".page").hide();
	$("#map").show();

	from_autocomplete = new google.maps.places.Autocomplete(document.getElementById("from_loc"));
	from_autocomplete.bindTo("bounds", map);
	from_autocomplete.addListener("place_changed", function() {
		var place = from_autocomplete.getPlace();
		console.log("new place (from)", place);
		if (place.geometry){
			if (from_blur_handel)
				clearTimeout(from_blur_handel);
			//localStorage.setItem("location:"+place.formatted_address, JSON.stringify(place.geometry.location));
			coded_location({lat: place.geometry.location.lat(), lng: place.geometry.location.lng()}, true);
			var addr = place.formatted_address;
			if (place.address_components[0].types != "street_number")
				addr = place.name;
			$("#from_loc").val(addr).next().show();
		}
	});

	to_autocomplete = new google.maps.places.Autocomplete(document.getElementById("to_loc"));
	to_autocomplete.bindTo("bounds", map);
	to_autocomplete.addListener("place_changed", function() {
		var place = to_autocomplete.getPlace();
		console.log("new place (to)", place);
		if (place.geometry){
			if (from_blur_handel)
				clearTimeout(to_blur_handel);
			//localStorage.setItem("location:"+place.formatted_address, JSON.stringify(place.geometry.location));
			coded_location({lat: place.geometry.location.lat(), lng: place.geometry.location.lng()}, false);
			var addr = place.formatted_address;
			if (place.address_components[0].types != "street_number")
				addr = place.name;
			$("#to_loc").val(addr).next().show();
		}
	});

	if (navigator.userAgent.match(/(iPad|iPhone|iPod)/g)) {
		var ios_places_catch_handel = setInterval(function() {
			var container = document.getElementsByClassName("pac-container");
			if (container[1]){
				container[0].addEventListener("touchend", function(e) {
					e.stopImmediatePropagation();
				});
				container[1].addEventListener("touchend", function(e) {
					e.stopImmediatePropagation();
				});
				clearInterval(ios_places_catch_handel);
			}
		}, 100);
	}

	console.log("finish load_map");
	
	start_splash_remove();
}

function open_menu(){
	$("#menu").addClass("open");
	$("#menu-overlay").addClass("enabled");
}

function close_menu(){
	$("#menu").removeClass("open");
	$("#menu-overlay").removeClass("enabled");
}

function get_geo_location(do_load){
	console.log("request geolocation");
	var do_load = do_load;
	navigator.geolocation.getCurrentPosition(function (pos){
		var loc = pos.coords;
		console.log("geopos", loc.latitude, loc.longitude);
		my_loc = new google.maps.LatLng(loc.latitude, loc.longitude);
		if (do_load){
			markers.my_loc = true;
			load_map();
			var marker = new google.maps.Marker({
				position: my_loc,
				map: map,
				zIndex: 30,
				icon: {
					url: "images/location.svg",
					size: new google.maps.Size(3000, 3000),
					origin: new google.maps.Point(0, 0),
					anchor: new google.maps.Point(11, 11),
					scaledSize: new google.maps.Size(22, 22)
				}
			});
			markers.my_loc = marker;
		}
		$("#from_loc").val("My Location");
		console.log("Current location");
		get_origin_geo(coded_location);
	}, function (error){
		console.log("geo error", error);
		$(".my_location").hide();
		$.getJSON("http://freegeoip.net/json/", function (data){
			console.log("ippos", data);
			my_loc = new google.maps.LatLng(data.latitude, data.longitude);
			if (do_load)
				load_map();
		}, function (err){console.log("call error", err)});
	});
}

function startup(){
	console.log("startup");
	if (!dev)
		$(".dev").hide();
	if (!has_internet){
		$("body").html("This app requires internet to function.");
		start_splash_remove();
		return;
	}
	
	get_geo_location(true);

	click_event(".do_lookup", function (){
		get_services();
		run_services();
	});

	click_event(".my_location", function (){
		get_geo_location();
		$("#from_loc").val("My Location");
		console.log("My location click");
		get_origin_geo(coded_location);
	}, true);

	$("#from_loc").on("keyup", function (e){
		if (e.keyCode == 13 || e.keyCode == 9){
			console.log("enter key from");
			get_origin_geo(coded_location);
			$("#to_loc").focus();
		}
	}).on("blur", function (){
		from_blur_handel = setTimeout(function (){
			console.log("blur from");
			get_origin_geo(coded_location);
			$("#results_tab").removeClass("hidden");
		});
	}).on("focus", function (){
		$("#results_tab").addClass("hidden");
	});
	$("#to_loc").on("keyup", function (e){
		if (e.keyCode == 13 || e.keyCode == 9){
			console.log("enter key to");
			get_destination_geo(coded_location);
			$(this).blur();
		}
	}).on("blur", function (){
		to_blur_handel = setTimeout(function (){
			console.log("plur to");
			get_destination_geo(coded_location);
			$("#results_tab").removeClass("hidden");
		}, 100);
	}).on("focus", function (){
		$("#results_tab").addClass("hidden");
	});

	click_event(".from_clear", function (){
		$("#from_loc").val("");
		console.log("from clear");
		get_origin_geo(coded_location);
	});

	click_event(".to_clear", function (){
		$("#to_loc").val("");
		console.log("to clear");
		get_destination_geo(coded_location);
	});

	click_event("#results_tab_handle", function (){
		if ($("#results_tab").hasClass("hidden")){
			minify_rout();
		} else {
			full_rout();
		}
		$("#results_tab").toggleClass("hidden");
	});

	click_event("#settings_tab_handle", function (){
		$("#settings_tab").toggleClass("hidden");
		if ($("#results_tab").hasClass("hidden")){
			settings.set("full_map_settings", true);
		} else {
			settings.set("full_map_settings", false);
		}
	});

	click_event(".result_expander .expander", function (e){
		$(e.currentTarget).parent().removeClass("result_expander").addClass("result_contractor").next(".sub_results").slideDown(200);
	}, true);
	click_event(".result_contractor .expander", function (e){
		$(e.currentTarget).parent().removeClass("result_contractor").addClass("result_expander").next(".sub_results").slideUp(200);
	}, true);

	click_event(".transit_info", function (e){
		var info_id = $(e.currentTarget).data("transit_info_id");
		console.log("trasit info", transit_holder[info_id]);

		var steps_html = [];
		for (var i=0;i<transit_holder[info_id].steps.length;i++){
			var step = transit_holder[info_id].steps[i];
			var temp = {num: i+1, time: ""};
			if (step.transit){
				var name = step.transit.line.short_name;
				temp.icon = "images/icons3/CUSTOM%20BUS%20ICON.RO.v9.svg";
				if (step.transit.line.vehicle.name == "Train"){
					name = step.transit.line.agencies[0].name + " " + step.transit.line.name;
					temp.icon = "images/icons3/CUSTOM%20LIGHTRAIL%20ICON.RO.v7.svg";
				} else if (step.transit.line.vehicle.type == "TRAM"){
					temp.icon = "images/icons3/CUSTOM%20LIGHTRAIL%20ICON.RO.v7.svg";
				}
				temp.time = step.transit.departure_time.text;
				temp.action = "Take "+step.transit.line.vehicle.name+" "+name+" to "+step.transit.headsign;
			} else {
				temp.icon = "images/icons3/CUSTOM%20WALKING%20ICON.RO.v3.svg";
				temp.action = step.instructions;
			}
			steps_html.push(template("transit_step", temp));
		}

		$("#transit_details").html(steps_html.join(""));
		$("#settings_tab").addClass("transit_open");
		$("#results_tab").addClass("transit_open");
		$(".settings_toggle").addClass("close_transit");

		$("#transit_details_tab").show();

		$(".transit_step .action").each(function (){
			var wid = $(window).width();
			if ($(this).width() > wid - 125){
				var sec = "";
				while ($(this).width() > wid - 140){
					var cont = $(this).html().split(" ");
					sec = cont.pop() + " " + sec;
					$(this).html(cont.join(" "));
				}
				if (sec != ""){
					$(this).parents(".transit_step").after(template("transit_step", {sec_line: true, action: sec.trim()}));
				}
			}
		});
	}, true);

	click_event("#transit_details_tab_handle", function (e){
		$(".settings_toggle").trigger("click_event");
	}, true);

	click_event(".settings_toggle", function (e){
		if ($(e.currentTarget).hasClass("close_transit")){
			$(e.currentTarget).removeClass("close_transit");
			$("#settings_tab").removeClass("transit_open");
			$("#results_tab").removeClass("transit_open");
			$("#transit_details_tab").hide();
		} else {
			$(e.currentTarget).toggleClass("open");
			if ($(e.currentTarget).hasClass("open")){
				$("#settings_tab").removeClass("open");
				$("#results_tab").removeClass("settings_open");
			} else {
				$("#settings_tab").addClass("open");
				$("#results_tab").addClass("settings_open");
			}
		}
	});

	click_event(".toggler", function (e){
		$(e.currentTarget).toggleClass("open");
		if ($(e.currentTarget).hasClass("open")){
			$(e.currentTarget).next(".options").slideDown(200);
		} else {
			$(e.currentTarget).next(".options").slideUp(200);
		}
	});

	click_event(".back", function (e){
		$(".page").hide();
		$("#"+$(e.currentTarget).data("back")).show();
	}, true);

	click_event("#menubutton", function (e){
		open_menu();
	});

	click_event("#menu-overlay", function (e){
		close_menu();
	});

	function open_external(result){
		if (result.data("dlink")){
			var app = result.data("dlink").substr(0, 4);
			track("External", app);
			open_intent(result.data("dlink"), backup_links[app][thePlatform]);
		} else if (result.data("ulink")){
			track("External", result.data("ulink").split("/")[2]);
			window.open(result.data("ulink"), "_blank");
		}
	}

	click_event(".confirm_link", function (e){
		var result = $(e.currentTarget);
		if (settings.get("show_external_conf")){
			var name = result.find(".name").html();
			var add = "";
			if (["a", "e", "i", "o", "u"].indexOf(name.charAt(0).toLowerCase()) != -1)
				add = "n";
			open_modal({title: "External App", content:"Do you want to open the "+result.attr("app").ucfirst()+" app for a"+add+" "+name+" now? <br /><br /><input type='checkbox' id='dont_show_external_conf' name='cc'><label for='dont_show_external_conf'><span><img src='images/radio_off.svg'><img src='images/radio_on.svg'></span></label>  Do not show me this message again.", button2: true, callback: function (btn){
				if ($("#dont_show_external_conf").prop("checked")){
					settings.set("show_external_conf", false);
					update_settings();
				}
				if (btn == "Ok"){
					open_external(result);
				}
			}});
		} else {
			open_external(result);
		}
	}, true);

	click_event(".tff_click", function (e){
		open_modala("loading...");
		tff_numbers(start_location, function(buss){
			var html = "";
			for (var i=0;i<buss.length;i++){
				var bus = buss[i];
				html += '<a class="no_close" style="color:white;" href="tel:'+bus.phone+'">'+bus.phone+' '+bus.name+'</a><br />';
			}
			close_modala();
			open_modal({title: "Taxi Companies", content: html, button1: "Close", add_class: "tff_model"});
		});
	}, true);

	function update_settings(){
		$(".settings_container").each(function (){
			var key = $(this).data("key");
			if (key){
				var opt = $(this).find("[data-key='"+settings.get(key)+"']");
				$(this).find(".option.selected").html(opt.html()).data("key", opt.data("key"));
				if (opt.data("icon")){
					$(this).find(".toggler .settings_icon").attr("src", opt.data("icon"));
					$(this).find(".option.selected .settings_icon").hide();
				}
				opt.hide();
			} else {
				$(this).find(".options").show();
			}
		});
	}
	update_settings();
	
	click_event(".option", function (e){
		var opt = $(e.currentTarget);
		var cont = opt.parents(".settings_container");
		if (cont.data("key")){
			if (opt.hasClass("selected"))
				return;
			cont.find(".option.selected").html(opt.html());
			cont.find(".option").show();
			settings.set(cont.data("key"), opt.data("key"));
			if (opt.data("icon")){
				cont.find(".toggler .settings_icon").attr("src", opt.data("icon"));
				cont.find(".option.selected .settings_icon").hide();
			}
			opt.hide();
			cont.find(".toggler").removeClass("open");
			cont.find(".options").slideUp(200);
		}
		if (jQuery.isFunction(window[cont.data("trigger")]))
			window[cont.data("trigger")](opt.data("key"));
	});

	click_event("#clear_cache", function (e){
		localStorage.clear();
		alert("cache cleared");
	});

	document.addEventListener("backbutton", function (){
		var backs = $(".back:visible");
		if (backs.length > 0){
			backs.first().trigger("click_event");
		} else if ($(".settings_toggle").hasClass("close_transit")){
			$(".settings_toggle").trigger("click_event");
		} else if ($(".settings_toggle").hasClass("open")){
			$(".settings_toggle").trigger("click_event");
		} else if ($("#menu-overlay:visible")){
			$("#menu-overlay").trigger("click_event");
		}
	}, false);

	click_event("#menu_contact", function (e){
		$("#menu-overlay").trigger("click_event");
		open_modal({title: "Contact us!", content: '<p>Send us a message, we\'d love to hear from you!</p><textarea id="message_text" class="touch_focus" placeholder="Contact us about bugs, requests, feedback, ideas, or just to say hi. :)" style="height: 150px; width:100%;"></textarea><input type="text" id="message_email" class="touch_focus" placeholder="Your email (for replies)" />', callback: function (btn) {
			if (btn == "Send"){
				var text = $("#message_text").val();
				var email = $("#message_email").val();
				if (text != ""){
					if (email == ""){
						if (confirm("Are you sure you want to send without a reply email address? We will be unable to respond to any questions or concerns.")){
							$.getJSON(base_url+"/ajax/app_contact.php", {app: app_info(), message:text, email:email}, function (data){
								console.log(data);
							});
						} else {
							reopen_modal();
							return;
						}
					} else {
						$.getJSON(base_url+"/ajax/app_contact.php", {app: app_info(), message:text, email:email}, function (data){
							console.log(data);
						});
					}
					open_modal({title: "Sent!", content: "Thank you for your message!", button1: "Close"});
				}
			}
		}, button2: true, button1: "Send", add_class: "contact_form"});
	});

	click_event("#menu_toc", function (e){
		$("#menu-overlay").trigger("click_event");
		$(".page").hide();
		$("#toc").show();
	});

	click_event("#menu_about", function (e){
		$("#menu-overlay").trigger("click_event");
		$(".page").hide();
		$("#about").show();
	});

	click_event("#menu_rate", function (e){
		if (thePlatform == "ios"){
			track("Menu", "rate apple");
			window.open("https://itunes.apple.com/us/app/apple-store/id1191203281?mt=8", '_blank');
		} else if (thePlatform == "android"){
			track("Menu", "rate android");
			open_intent("market://details?id=com.mooky", "https://play.google.com/store/apps/details?id=com.mooky");
		}
	});

	var device = device_info();
	$(".version").html(device.version);
	if (typeof AppVersion != "undefined"){
		$(".build").html(AppVersion.build);
	}

	if (settings.get("full_map_settings")){
		$("#settings_tab").removeClass("hidden");
	}
}

function one_click(type){
	track("Results", "one click", type);
	var sorter = type;
	var result = $(".result[app]").sort(function (a, b){
		return $(a).data(sorter) - $(b).data(sorter);
	});
	result.first().trigger("click_event");
	console.log("one_click", type, result.first());
}

function open_intent(intent, fallback){
	console.log("intent", intent, fallback);
	var fallback = fallback;
	if (typeof startApp == "undefined"){//browser fallback
		console.log("intent", intent, fallback);
		alert("intent "+intent+", "+fallback);
		return;
	}
	var data = false;
	if (thePlatform == "android"){
		var parts = fallback.split("=");
		startApp.set({
			"action": "ACTION_VIEW",
			"package": parts[1],
			"uri": intent
		}).start(function (){
			console.log("successful intent");
		}, function (err){
			console.log("intent fail", err);
			if (fallback.substr(0, 4) == "http"){
				window.open(fallback, "_system");
			} else {
				window.location = fallback;
			}
		});
	} else if (thePlatform == "ios"){
		startApp.set(intent).go(function (){
			console.log("successful intent");
			//window.location = intent;
		}, function (err){
			console.log("intent fail", err);
			if (fallback.substr(0, 4) == "http"){
				window.open(fallback, "_system");
			} else {
				window.location = fallback;
			}
		});
	}
}