"use strict"

var map;
var geocoder;
var bounds;
var markers = {};
var my_loc = false;
var full_bounds = false;
var user_moved_map = false;

var DirectionsService = new google.maps.DirectionsService();
var from_autocomplete;
var to_autocomplete;

var run_handel = false;

var transit_holder = [];

var results_call = 0;
var results_to_return = 4;

function get_origin_geo(callback){
	var ret = $("#from_loc").val().toLowerCase();
	if (ret == "my location" && my_loc){
		$("#from_loc").next().show();
		callback({lat: my_loc.lat(), lng: my_loc.lng()}, true);
	} else if (ret != ""){
		$("#from_loc").next().show();
		var cache = localStorage.getItem("location:"+ret);
		if (cache){
			callback(JSON.parse(cache), true);
			return;
		}
		geocoder.geocode({bounds: map.getBounds(), address: ret}, function (results, status){
			if (status == "OK"){
				localStorage.setItem("location:"+ret, JSON.stringify(results[0].geometry.location));
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
			callback(JSON.parse(cache));
			return;
		}
		geocoder.geocode({bounds: map.getBounds(), address: ret}, function (results, status){
			if (status == "OK"){
				localStorage.setItem("location:"+ret, JSON.stringify(results[0].geometry.location));
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
		console.log(status, response);
		var results = [];
		if (markers.google_routs){
			for (var i=0;i<markers.google_routs.length;i++){
				markers.google_routs[i].setMap(null);
			}
		}
		markers.google_routs = [];
		transit_holder = [];
		var bounds = new google.maps.LatLngBounds();
		for (var i=0;i<response.routes.length;i++){
			var route = response.routes[i];
			var msec = new Date(route.legs[0].departure_time.value).getTime() - new Date().getTime();
			var obj = {icon: '<i class="fa fa-bus" aria-hidden="true" style="color:grey"></i>', name: "Transit", price: " ---", time: "N/A"};
			if (route.fare && route.fare.value)
				obj.price = route.fare.value;
			obj.time_sec = Math.ceil(msec/1000);
			var path = new google.maps.Polyline({
				path: route.overview_path,
				geodesic: true,
				strokeColor: '#999999',
				strokeOpacity: 0.8,
				strokeWeight: 2,
				map: map
			});
			markers.google_routs.push(path);
			route.overview_path.forEach(function(e) {
				bounds.extend(e);
			});
			obj.route_id = markers.google_routs.length;
			obj.transit_info = transit_holder.length;
			transit_holder.push(route.legs[0]);
			results.push(obj);
		}
		map.fitBounds(bounds);
		returned_results(results, "Transit");
		DirectionsService.route({origin: start, destination: stop, travelMode:"DRIVING"}, function (response, status){
			var bounds = new google.maps.LatLngBounds();
			for (var i=0;i<response.routes.length;i++){
				var route = response.routes[i];
				var path = new google.maps.Polyline({
					path:route.overview_path,
					geodesic:true,
					strokeColor:"#555555",
					strokeOpacity:1.0,
					strokeWeight:3,
					map:map
				});
				markers.google_routs.push(path);
				route.overview_path.forEach(function(e){
					bounds.extend(e);
				});
				break;
			}
			map.fitBounds(bounds);
			full_bounds = bounds;
		});
	});
}

function service_uber(call_num, start, stop){
	$.getJSON(base_url+"/ajax/uber.php", {start_latitude: start.lat, start_longitude: start.lng, end_latitude: stop.lat, end_longitude: stop.lng, server_token: "RyPsVZOnqU4IGpw_F_R1TOPNKbxC8tMgsPPT15lb"}, function (data){
		if (results_call > call_num)
			return;
		var results = [];
		for (var i=0;i<data.length;i++){
			var price = data[i];
			var obj = {icon: '<img src="images/uber_icon.png">', name: price.localized_display_name, price_multiply: price.surge_multiplier, time_sec: price.time_estimate};
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
				returned_results([{icon: '<i class="fa fa-taxi" aria-hidden="true"></i>', name: "Taxi", price: data.total_fare}]);
			}
		}
	});
}

var lyft_token = false;
var lyft_eta_data = false;
var lyft_cost_data = false;

function process_lyft(){
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
			var obj = {icon: '<img src="images/lyft_icon.png">', name: est.display_name, time_sec: etas[est.ride_type]?etas[est.ride_type]:"N/A", price_multiply: surge_multi};
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
			results.push(obj);
		}
		returned_results(results, "Lyft");
	}
}

function service_lyft(call_num, start, stop){
	if (lyft_token){
		lyft_cost_data = false;
		lyft_eta_data = false;
		$.ajax({
			url: "https://api.lyft.com/v1/cost",
			data: {start_lat: start.lat, start_lng: start.lng, end_lat: stop.lat, end_lng: stop.lng},
			beforeSend: function (xhr) {
				xhr.setRequestHeader ("Authorization", "bearer "+lyft_token);
			}, success: function (data){
				if (results_call > call_num)
					return;
				lyft_cost_data = data;
				process_lyft();
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
				process_lyft();
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
			results[0].sub_results = format_results(results);
			results[0].name = over_name + " ("+results.length+")";
			$("#results").append(template("overload_result", results[0]));
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
				result.price = "$"+result.price_min + "-" + result.price_max;
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
	var sorter = $(".sort.selected").data("type");

	$(".sub_results").each(function (){
		var t = $(this);
		var result = t.children(".result").sort(function (a, b){
			return $(a).data(sorter) - $(b).data(sorter);
		});
		t.append(result);
		var top = t.children(".result").first();
		t.parent().data(sorter, top.data(sorter));
		t.siblings(".price").html(top.children(".price").html());
		t.siblings(".time").html(top.children(".time").html());
	});

	var result = $("#results > .result").sort(function (a, b){
		return $(a).data(sorter) - $(b).data(sorter);
	});
	$("#results").append(result);
}

function geo_location(id, geo){
	geocoder.geocode({location: geo}, function (results, status){
		if (status == "OK"){
			localStorage.setItem("location:"+results[0].formatted_address, JSON.stringify(geo));

			console.log(id, results);
			$(id).val(results[0].formatted_address);
		}
	});
}

var start_location = false;
var stop_location = false;
function coded_location(pos, start, trigger){
	console.log(pos, start, trigger);
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
				icon: {
					url: "images/green.png"
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
				icon:{
					url:"images/blue.png"
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
			if (start_location && stop_location){
				$("#search_animation").show();
				++results_call;
				bounds = new google.maps.LatLngBounds();
				bounds.extend(new google.maps.LatLng(start_location));
				bounds.extend(new google.maps.LatLng(stop_location));
				map.fitBounds(bounds);
				map.panToBounds(bounds);
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

function minify_rout(pow){
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

function full_rout(){
	if (full_bounds)
		map.fitBounds(full_bounds);
}

function load_map(){

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
	map = new google.maps.Map(document.getElementById("map-canvas"), options);
	geocoder = new google.maps.Geocoder();

	map.addListener("click", function (event){
		if (!markers.start){
			coded_location({lat: event.latLng.lat(), lng: event.latLng.lng()}, true, true);
			$("#from_loc").next().show();
		} else if (!markers.stop){
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
		localStorage.setItem("location:"+place.formatted_address, JSON.stringify(place.geometry.location));
		coded_location({lat: place.geometry.location.lat(), lng: place.geometry.location.lng()}, true);
		var addr = place.formatted_address;
		if (place.address_components[0].types != "street_number")
			addr = place.name;
		$("#from_loc").val(addr).next().show();
	});

	to_autocomplete = new google.maps.places.Autocomplete(document.getElementById("to_loc"));
	to_autocomplete.bindTo("bounds", map);
	to_autocomplete.addListener("place_changed", function() {
		var place = to_autocomplete.getPlace();
		localStorage.setItem("location:"+place.formatted_address, JSON.stringify(place.geometry.location));
		coded_location({lat: place.geometry.location.lat(), lng: place.geometry.location.lng()}, false);
		var addr = place.formatted_address;
		if (place.address_components[0].types != "street_number")
			addr = place.name;
		$("#to_loc").val(addr).next().show();
	});
	
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

function startup(){
	if (!dev)
		$(".dev").hide();
	if (!has_internet){
		$("body").html("This app requires internet to function.");
		return;
	}
	
	navigator.geolocation.getCurrentPosition(function (pos){
		var loc = pos.coords;
		console.log("geopos", loc.latitude, loc.longitude);
		my_loc = new google.maps.LatLng(loc.latitude, loc.longitude);
		markers.my_loc = true;
		load_map();
		var marker = new google.maps.Marker({
			position: my_loc,
			map: map,
			icon: {
				url: "images/person.png",
				size: new google.maps.Size(35, 35),
				origin: new google.maps.Point(0,0),
				anchor: new google.maps.Point(17, 17)
			}
		});
		markers.my_loc = marker;
		$("#from_loc").val("My Location");
		get_origin_geo(coded_location);
	}, function (error){
		$(".my_location").hide();
		$.getJSON("http://freegeoip.net/json/", function (data){
			console.log("ippos", data);
			my_loc = new google.maps.LatLng(data.latitude, data.longitude);
			load_map();
		});
		console.log(error);
	});

	click_event(".do_lookup", function (){
		get_services();
		run_services();
	});
	
	click_event(".my_location", function (){
		$("#from_loc").val("My Location");
		get_origin_geo(coded_location);
	}, true);

	$("#from_loc").on("keyup", function (e){
		if (e.keyCode == 13 || e.keyCode == 9){
			get_origin_geo(coded_location);
			$("#to_loc").focus();
		}
	}).on("blur", function (){
		get_origin_geo(coded_location);
		$("#results_tab").removeClass("hidden");
	}).on("focus", function (){
		$("#results_tab").addClass("hidden");
	});
	$("#to_loc").on("keyup", function (e){
		if (e.keyCode == 13 || e.keyCode == 9){
			get_destination_geo(coded_location);
			$(this).blur();
		}
	}).on("blur", function (){
		get_destination_geo(coded_location);
		$("#results_tab").removeClass("hidden");
	}).on("focus", function (){
		$("#results_tab").addClass("hidden");
	});

	click_event(".from_clear", function (){
		$("#from_loc").val("");
		get_origin_geo(coded_location);
	});

	click_event(".to_clear", function (){
		$("#to_loc").val("");
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

	click_event(".sort", function (e){
		$(".sort").removeClass("selected");
		$(e.currentTarget).addClass("selected");
		sort_results();
	});

	click_event(".result_expander .expander", function (e){
		$(e.currentTarget).parent().removeClass("result_expander").addClass("result_contractor").find(".sub_results").slideDown(200);
	}, true);
	click_event(".result_contractor .expander", function (e){
		$(e.currentTarget).parent().removeClass("result_contractor").addClass("result_expander").find(".sub_results").slideUp(200);
	}, true);

	click_event(".transit_info", function (e){
		var info_id = $(e.currentTarget).data("transit_info_id");
		console.log(transit_holder[info_id]);

		var steps_html = [];
		for (var i=0;i<transit_holder[info_id].steps.length;i++){
			var step = transit_holder[info_id].steps[i];
			if (step.transit){
				var name = step.transit.line.short_name;
				if (step.transit.line.vehicle.name == "Train")
					name = step.transit.line.agencies[0].name + " " + step.transit.line.name;
				var action = "Take "+step.transit.line.vehicle.name+" "+name+" to "+step.transit.headsign+" at "+step.transit.departure_time.text;
			} else {
				var action = step.instructions;
			}
			steps_html.push(template("transit_step", {"num": i+1, "action": action}));
		}

		$("#transit_steps").html(steps_html.join(""));

		$(".page").hide();
		$("#transit_info").show();
	}, true);

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



	if (navigator.userAgent.match(/(iPad|iPhone|iPod)/g)) {
		setTimeout(function() {
			var container = document.getElementsByClassName("pac-container");
			container[0].addEventListener("touchend", function(e) {
				e.stopImmediatePropagation();
			});
			container[1].addEventListener("touchend", function(e) {
				e.stopImmediatePropagation();
			});
		}, 500);
	}





	click_event("#clear_cache", function (e){
		localStorage.clear();
	});
};