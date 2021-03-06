/*
 *
 * v2.0 Initial Version
 * v2.1 Included more video types
 * v2.2 Enabled the fullscreen Option
 * v2.3 Included the status bar and adjusts to play in a window
 * v2.4 Included a shuffle option
 *		fixed the problem of pressing the next button rapidly
 *		The list updates automaticaly at start
 * v2.5 It can now logs the steps (have to enable it on the videoplayer-v2.js & videoplayer.sh files)
 *		closes the app if is not the current (first attempt)
 *		fixes the issue of pressing mutiple times the search video button
 *		fixes the application not showing the controls again when a video play fails
 *		fixes playing the same video when shuffle is active
 *		starts using a swap file on start of the app if not running (still have to create the swap with the AIO)
 * v2.6 Change gst-launch for gplay, incorporing pause, resume, rw, ff
 *		Direct send of commands to sh (Better control)
 *		Close of WebSocket as it should be (saves memory)
 *		Change of port 55555 to 9998 in order to avoid problems with some cmu processes
 *		Bugfix for files with more than one consecutive white space
 *		Most of the times it stops the video when you put reverse with no problems
 * v2.7 Include pause when touching the video in the center, rewind when touching the left side and Fast Forward when touching the right side. (15% of the screen each)
 *			Correct problem when stopping a paused video (the icon shows an incorrect image at the beginning of the next video)
 * v2.8 |----------------------------------------------------------------------------------------------|
 *		|- Multicontroller support ----- [In Video List] ------------ [During Playback] ---------------|
 *		|----------------------------------------------------------------------------------------------|
 *		|- Press command knob ---------- [Select video] ------------- [Play/pause] --------------------|
 *		|- Tilt up --------------------- [Video list pgup] ---------- [Toggle fullscreen] -------------|
 *		|- Tilt down ------------------- [Video list pgdn] ---------- [Stop] --------------------------|
 *		|- Tilt Right ------------------ [Toggle shuffle mode] ------ [Next] --------------------------|
 *		|- Tilt left ------------------- [Toggle repeat all] -------- [Previous] ----------------------|
 *		|- Rotate command knob CCW/CW -- [Scroll video list up/dn] -- [RW/FF (10 seconds)] ------------|
 *		|----------------------------------------------------------------------------------------------|
 *		Lowered RW/FF time from 30s => 10s for beter control with command knob rotation
 *		Change method of managing the video list to jquery instead of bash
 *		Avoid problems when using files with ', " or other special characters. You must remove this character from your video name
 *		Use of the command knob to control the playback and to select the videos
 *		Use of the websocketd file provided by diginix
 *		Previous video option
*		Option to select the playback option with the commander (tilt left or right)
 * v2.9 Repeat All option: Keep track of recently played videos so videos aren't repeated until the entire list is played.
 *		Toggling repeat 1/all or shuffle OFF resets recentlyPlayed list; shuffle ON, stopping playback, and rebooting do not.
 *		After last video in the list is played, jumps to the first video in the list.
 *		User variables are saved to localStorage: shuffle, repeat 1, repeat all, fullscreen, and recently played list.
 *		Option to select the playback option with the commander (tilt left or right)
 * v3.2 Sort order now is case insensitive (only for no unicode)
 *		You can choose the color of the interface (Red, Orange, Green and Blue only). You have to change the name of the variable in the JS
 *		You start the selecting the last played video
 *		Small fixes on the FF / RW in order to make only one call
 *		Added a plugin to the cmu in order to allow fullscreen toggle (commander up while playing). It allows to resize and rotate also (not available on the GUI yet)
 *		 Delete the gstreamer registry on start in order to fix the plugin repository (Resets to the one without the codecs at car restart)
 * v3.3 Fixes the unicode list retrieve and removes the "only unicode" method
 *		Now it takes the time from gplay app
 *		Adds the flac codec to the gstreamer libs
 *		It has the option to play flac and mp3 files (from the Music folder un the usb stick). More formats will be supported (They need to be tested)
 *		It shows the metadata of the files when playing music
 *		Disabled the log functions as they are not needed now
 * v3.4 Has aspect ratio and 2 fullscreen modes. One of them preserving the video size ratio
 *		Doesn't show the FullScreen button when playing music
 *		Fixed a problem while selecting the options with the commander
 * TODO:
 *		Get detailed errors from gplay
 *		Change the audio input and stop the music player. If just mutes the player the system lags when playing
 *		Complete the plugins in the cmu in order to allow more file types (mkv / ogg / ac3)
 */

var vpColor = "Red";
var vphColor = "darkred";
var vpColorClass = "selectedItem" + vpColor;

//var folderPath='/home/victor/Videos1';
var folderPath='/tmp/mnt';
var currentVideoTrack = JSON.parse(localStorage.getItem('videoplayer.currentvideo')) || null;
var Repeat = JSON.parse(localStorage.getItem('videoplayer.repeat')) || false;
var FullScreen = JSON.parse(localStorage.getItem('videoplayer.fullscreen')) || 0; //0 no FS - 1 FS - 2 Stretch
var Shuffle = JSON.parse(localStorage.getItem('videoplayer.shuffle')) || false;
var RepeatAll = JSON.parse(localStorage.getItem('videoplayer.repeatall')) || false;
var PlayMusic = JSON.parse(localStorage.getItem('videoplayer.playmusic')) || false;
var currentVideoListContainer = 0;
var totalVideoListContainer = 0;
var waitingWS = false;
var waitingForClose=false;
var totalVideos = 0;
var intervalVideoPlayer;
var VideoPaused = false;
var CurrentVideoPlayTime = null;
var TotalVideoTime = null;
var intervalPlaytime;
var waitingNext = false;
var selectedItem = 0;
var recentlyPlayed = JSON.parse(localStorage.getItem('videoplayer.recentlyplayed')) || [];
var statusbarTitleVideo = JSON.parse(localStorage.getItem('videoplayer.statusbartitle')) || false;
var selectedOptionItem = -1; //6 ??
//var stretchVideo = false;

var boxChecked = 'url(apps/_videoplayer/templates/VideoPlayer/images/myVideoCheckedBox.png)';
var boxUncheck = 'url(apps/_videoplayer/templates/VideoPlayer/images/myVideoUncheckBox.png)';
var optionsPanelOpen = false;

var metadataTitle;
var metadataAlbum;
var metadataComposer;
var metadataAlbumArtist;
var metadataArtist;
var metadataTrackNumber;
var metadataGenre;
var metadataComment;
var metadataAudioCodec;
var metadataVideoRatio;
var videoHeight = null;
var videoWidth = null;

var src = '';

var wsVideo = null;

$(document).ready(function(){
	try
	{
		//localStorage.clear();
		
		$('#SbSpeedo').fadeOut();
		if (localStorage.getItem('videoplayer.colortheme')) {
			var colorPick = JSON.parse(localStorage.getItem('videoplayer.colortheme')) || null;
			if(utility.toType(colorPick) === "array") {
				vpColor = colorPick[0].charAt(0).toUpperCase() + colorPick[0].slice(1);
				vphColor = colorPick[1];
			} 
			else if(utility.toType(colorPick) === "string")  {
				vpColor = colorPick.charAt(0).toUpperCase() + colorPick.slice(1);
				vphColor = colorPick;
			}
			vpColorClass = "selectedItem" + vpColor;
		}
		if (JSON.parse(localStorage.getItem('videoplayer.background'))) {
			$('#myVideoContainer').addClass('noBg');
		}
	}
	catch(err)
	{

	}
	//setCheckBoxes('#myVideoFullScrBtn', FullScreen);
	$('#myVideoFullScrBtn').css('background-image', 'url(apps/_videoplayer/templates/VideoPlayer/images/myFullScreen' + FullScreen + '.png)');
	setCheckBoxes('#myVideoShuffleBtn', Shuffle);
	setCheckBoxes('#myVideoRepeatBtn', Repeat);
	setCheckBoxes('#myVideoRepeatAllBtn', RepeatAll);
	setCheckBoxes('#myPlayMusicBtn', PlayMusic);
	function setCheckBoxes(opId, checkIt) {
		var check = (checkIt) ? boxChecked : boxUncheck;
		$(opId).css({'background-image': check});
	}
	$('#colorThemes a').click(function(e){
		var colorPick = $(this).html();
		$('#colorThemes a').css('background','').removeClass(vpColorClass);
		vpColor = colorPick.charAt(0).toUpperCase() + colorPick.slice(1);
		vphColor = $(this).attr('class');
		vpColorClass = "selectedItem" + vpColor;
		$(this).css('background', vphColor);
		var themeColors = [vpColor,vphColor];
		localStorage.setItem('videoplayer.colortheme', JSON.stringify(themeColors));
	});

	src = '';
	
	/* src += 'USBDRV=$(ls /mnt | grep sd); ' +

		'for USB in $USBDRV; ' +
		'do ' +
		'USBPATH=/tmp/mnt/${USB}; ' +
		'SWAPFILE="${USBPATH}"/swapfile; ' +
		'if [ -e "${SWAPFILE}" ]; ' +
		'then ' +
		'mount -o rw,remount ${USBPATH}; ' +
		'mkswap ${SWAPFILE};' +
		'swapon ${SWAPFILE}; ' +
		'break; ' +
		'fi; ' +
		'done; '; */
	
	//src += 'rm -f /tmp/root/.gstreamer-0.10/registry.arm.bin;'; //cleans the gstreamer registry

	//src += 'gst-inspect-0.10 > /dev/null 2>&1; '; // Start gstreamer before starting videos

	myVideoWs(src, false); //start-swap

	/* reboot system
	==================================================================================*/
	$('#rebootBtnDiv').click(function(){
		myRebootSystem();
	});

	/* retrieve video list
	==================================================================================*/
	$('#myVideoMovieBtn').click(function(){
		myVideoListRequest();
	});

	/* scroll up video list
	==================================================================================*/
	$('#myVideoScrollUp').click(function(){
		myVideoListScrollUpDown('up');
	});

	/* scroll down video list
	==================================================================================*/
	$('#myVideoScrollDown').click(function(){
		myVideoListScrollUpDown('down');
	});

	/* play pause playback
	==================================================================================*/
	$('#myVideoPausePlayBtn').click(function(){
		myVideoPausePlayRequest();
	});
	$('#videoPlayBtn').click(function(){
		myVideoPausePlayRequest();
	});

	/* FullScreen playback
	==================================================================================*/
	$('#myVideoFullScrBtn').click(function(){
		if(FullScreen === 2){
			FullScreen = 0;
			//$('#myVideoFullScrBtn').css({'background-image' : boxUncheck});
		}
		else if (FullScreen === 0)
		{
			FullScreen = 1;
			//$('#myVideoFullScrBtn').css({'background-image' : boxUncheck});
		}
		else {
			FullScreen = 2;
			//$('#myVideoFullScrBtn').css({'background-image' : boxChecked});
		}
		$('#myVideoFullScrBtn').css('background-image', 'url(apps/_videoplayer/templates/VideoPlayer/images/myFullScreen' + FullScreen + '.png)');

		try
		{
				localStorage.setItem('videoplayer.fullscreen', JSON.stringify(FullScreen));
		}
		catch(err)
		{
			framework.common.setSbName(err.message);
		}
	});

	/* stop playback
	==================================================================================*/
	$('#myVideoStopBtn, #videoStopBtn').click(function(){
		myVideoStopRequest();
	});

	/* start playback
	==================================================================================*/
	$('#myVideoList').on("click", "li", function() {
		myVideoStartRequest($(this));
	});

	/* next track
	==================================================================================*/
	$('#myVideoNextBtn, #videoNextBtn').click(function(){
		myVideoNextRequest();
	});

	/* previous track
	==================================================================================*/
	$('#myVideoPreviousBtn, #videoPrevBtn').click(function(){
		myVideoPreviousRequest();
	});

	/* FF
	==================================================================================*/
	$('#myVideoFF').click(function(){
		myVideoFFRequest();
	});
	$('#videoPlayFFBtn').click(function(){
		myVideoFFRequest();
	});

	/* RW
	==================================================================================*/
	$('#myVideoRW').click(function(){
		myVideoRWRequest();
	});
	$('#videoPlayRWBtn').click(function(){
		myVideoRWRequest();
	});

	/* repeat option (looping single track)
	==================================================================================*/
	$('#myVideoRepeatBtn').click(function(){
		if(Repeat){
			Repeat = false;
			$('#myVideoRepeatBtn').css({'background-image' : boxUncheck});
		} else {
			Repeat = true;
			$('#myVideoRepeatBtn').css({'background-image' : boxChecked});
		}
		recentlyPlayed = [];
		localStorage.setItem('videoplayer.repeat', JSON.stringify(Repeat));
	});

	/* repeat all option (loop entire video list)
	==================================================================================*/
	$('#myVideoRepeatAllBtn, #videoReAllBtn').click(function(){
		if(RepeatAll){
			RepeatAll = false;
			$('#myVideoRepeatAllBtn').css({'background-image' : boxUncheck});
		} else {
			RepeatAll = true;
			$('#myVideoRepeatAllBtn').css({'background-image' : boxChecked});
		}
		recentlyPlayed = [];
		localStorage.setItem('videoplayer.repeatall', JSON.stringify(RepeatAll));
	});

	/* Shuffle option
	==================================================================================*/
	$('#myVideoShuffleBtn, #videoShuffleBtn').click(function(){
		if(Shuffle)
		{
			Shuffle = false;
			$('#myVideoShuffleBtn').css({'background-image' : boxUncheck});
			recentlyPlayed = [];
		}
		else
		{
			Shuffle = true;
			$('#myVideoShuffleBtn').css({'background-image' : boxChecked});
		}
		localStorage.setItem('videoplayer.shuffle', JSON.stringify(Shuffle));
	});

	/* Music
	==================================================================================*/
	$('#myPlayMusicBtn').click(function(){
		if(PlayMusic){
			PlayMusic = false;
			$('#myPlayMusicBtn').css({'background-image' : boxUncheck});
		} else {
			PlayMusic = true;
			$('#myPlayMusicBtn').css({'background-image' : boxChecked});
		}
		myVideoListRequest();
		localStorage.setItem('videoplayer.playmusic', JSON.stringify(PlayMusic));
	});

	/* Toggle Background Button
	==================================================================================*/
	$('#toggleBgBtn').click(function(){
		$('#myVideoContainer').toggleClass('noBg');
		localStorage.setItem('videoplayer.background', JSON.stringify($('#myVideoContainer').hasClass('noBg')));
	});

	/* Show Current Playing Video Title in the Statusbar
	==================================================================================*/
	$('#optionStatusbarTitle').click(function(){
		statusbarTitleVideo = !statusbarTitleVideo;
		if (statusbarTitleVideo) {
			$('#optionStatusbarTitle').css({'background-image' : boxChecked});
		} else {
			framework.common.setSbName("Video Player");
			$('#optionStatusbarTitle').css({'background-image' : boxUncheck});
		}
		localStorage.setItem('videoplayer.statusbartitle', JSON.stringify(statusbarTitleVideo));
	});
	$('#optionTestError').click(function(){
		var res = "test";
		showMemErrorMessage(res);
		$('.memErrorMessage').delay(1500).fadeOut(1000);
		$(this).blur();
	});

  /* Video information / options panel
  ==================================================================================*/
  $('#myVideoInfo, #myVideoInfoClose').click(function(){
    $('#videoInfoPanel').toggleClass('showInfo');
    optionsPanelOpen = $('#videoInfoPanel').hasClass('showInfo');
    if(optionsPanelOpen){
      $('#popInfoTab').css("background", vpColor);
      setCheckBoxes('#optionStatusbarTitle', statusbarTitleVideo);
    } else {
      SelectCurrentTrack();
    }
  });

	$('#popInfoTab').click(function(){
		$('#videoInfoPanel').removeClass('state');
		$('#popInfoTab').css("background", vphColor);
		$('#popOptionsTab').css("background", '');
	});
	$('#popOptionsTab').click(function(){
		$('#videoInfoPanel').addClass('state');
		$('#popOptionsTab').css("background", vphColor);
		$('#popInfoTab').css("background", '');
	});


	setTimeout(function () {
		myVideoListRequest();
	}, 500);

	//try to close the video if the videoplayer is not the current app
	intervalVideoPlayer = setInterval(function () {

		if ((!waitingForClose) && (framework.getCurrentApp() !== '_videoplayer'))
		{
			myVideoStopRequest();
			waitingForClose = true;
			clearInterval(intervalVideoPlayer);

			clearInterval(intervalPlaytime);
		}
	}, 1);//some performance issues ??
});



// try not to make changes to the lines below

// Start of Video Player
// #############################################################################################


/* reboot system
==========================================================================================================*/
function myRebootSystem(){
	myVideoWs('reboot', false); //reboot
}


/* video list request / response
==========================================================================================================*/
function myVideoListRequest(){
	if (!waitingWS)
	{
		waitingWS=true;
		currentVideoListContainer = 0;
		$('#myVideoScrollUp').css({'visibility' : 'hidden'});
		$('#myVideoScrollDown').css({'visibility' : 'hidden'});
		$('#myVideoList').html("<img id='ajaxLoader' src='apps/_videoplayer/templates/VideoPlayer/images/ajax-loader.gif'>");

		src='';

		src += 'FILES=""; ';

		if (!PlayMusic)
		{
			src += 'for VIDEO in /tmp/mnt/sd*/Movies/*.mp4 /tmp/mnt/sd*/Movies/*.avi /tmp/mnt/sd*/Movies/*.flv /tmp/mnt/sd*/Movies/*.wmv /tmp/mnt/sd*/Movies/*.3gp /tmp/mnt/sd*/Movies/*.mkv;';
			$('#myVideoFullScrBtn').css({'display' : 'block'});
			$('#myVideoFullScrBtn').css({'visibility' : 'visible'});
			$("#myVideoFullScrBtn").addClass('playbackOption');
		}
		else
		{
			src += 'for VIDEO in /tmp/mnt/sd*/Music/*.flac /tmp/mnt/sd*/Music/*.mp3;';
			$('#myVideoFullScrBtn').css({'display' : 'none'});
			$('#myVideoFullScrBtn').css({'visibility' : 'hidden'});
			$("#myVideoFullScrBtn").removeClass('playbackOption');
		}

		src += 'do ' +
			'FILES="${FILES}${VIDEO}|"; ' +
			'done; ' +
			'FILES=$(echo "${FILES}" | tr \'|\' \'\n\' | sort -f -t \/ -k 6 | tr \'\n\' \'|\'); ';

		src += 'echo playback-list//#"${FILES}"';

		myVideoWs(src, true); //playback-list
	}

}

function myVideoListResponse(data){
	waitingWS=false;

	$("#myVideoList").html("");

	data = data.replace(folderPath+'/sd*/Movies/*.mp4|', '');
	data = data.replace(folderPath+'/sd*/Movies/*.avi|', '');
	data = data.replace(folderPath+'/sd*/Movies/*.flv|', '');
	data = data.replace(folderPath+'/sd*/Movies/*.wmv|', '');
	data = data.replace(folderPath+'/sd*/Movies/*.3gp|', '');
	data = data.replace(folderPath+'/sd*/Movies/*.mkv|', '');
	data = data.replace(folderPath+'/sd*/Music/*.mp3|', '');
	data = data.replace(folderPath+'/sd*/Music/*.flac|', '');

	data = data.substring(1);

	var videos = data.split('|');
	videos.splice(videos.length - 1);
	totalVideoListContainer = 1;


	if((!videos[0]) || (videos[0] === "")){

		var txt;

		if (!PlayMusic)
		{
			txt = 'No videos found<br><br>Tap <img src="apps/_videoplayer/templates/VideoPlayer/images/myVideoMovieBtn.png" style="margin-left:8px; margin-right:8px" /> to search again<br><br>Make sure your avi/mp4/flv/wmv/3gp files are in the "Movies" folder';
		}
		else
		{
			txt = 'No music found<br><br>Tap <img src="apps/_videoplayer/templates/VideoPlayer/images/myVideoMovieBtn.png" style="margin-left:8px; margin-right:8px" /> to search again<br><br>Make sure your flac/mp3 files are in the "Music" folder';
		}

		$("#myVideoList").html(txt);

		currentVideoTrack = null;

		$(".playbackOption").css("background-image", function(i, val){return val.substring(0, val.indexOf(")")+1);});

		selectedOptionItem = 8;

		$(".playbackOption").eq(selectedOptionItem).css("background-image", function(i, val){return val + ", -o-linear-gradient(top," + vphColor + ", rgba(0,0,0,0))";});
	}
	else
	{
		$(".playbackOption").css("background-image", function(i, val){return val.substring(0, val.indexOf(")") + 1);});
		$("#myVideoList").append($('<ul id="ul' + totalVideoListContainer + '"></ul>')
		.addClass("videoListContainer"));
		var videoListUl = $("#ul" + totalVideoListContainer);

		videos.forEach(function(item, index){

			if ((index > 0) && (index) % 8 === 0)
			{
				totalVideoListContainer++;
				$("#myVideoList").append($('<ul id="ul' + totalVideoListContainer + '"></ul>')
				.addClass("videoListContainer"));
				videoListUl = $("#ul"+totalVideoListContainer);
			}

			var videoName = item.replace(folderPath, '');
			if (!PlayMusic)
			{
			videoName = videoName.substring(videoName.search(/\/movies\//i) + 8);
			}
			else
			{
				videoName = videoName.substring(videoName.search(/\/music\//i) + 7);
			}

			videoListUl.append($('<li></li>')
			.attr({
				'video-name': videoName,
				'video-data': item
				})
			.addClass('videoTrack')
			.html(index + 1 + ". " + videoName.replace(/  /g, " &nbsp;")));
		});

		totalVideos = videos.length;
		SelectCurrentTrack();

		if(totalVideoListContainer > 1)
		{
			$('#myVideoScrollDown').css({'visibility' : 'visible'});
		}
		
		//framework.common.setSbName('a - ' + localStorage.length);
	}
}

/* video list scroll up / down
==========================================================================================================*/
function myVideoListScrollUpDown(action){

	switch(action) {
		case 'up':
		currentVideoListContainer--;
		break;
		case 'down':
		currentVideoListContainer++;
		break;
		case 'top':
		currentVideoListContainer = 0;
		break;
		case 'bottom':
		currentVideoListContainer = totalVideoListContainer -1;
		break;
	}

	if(currentVideoListContainer === 0){
		$('#myVideoScrollUp').css({'visibility' : 'hidden'});
	} else { // if(currentVideoListContainer > 0)
		$('#myVideoScrollUp').css({'visibility' : 'visible'});
	}

	if(currentVideoListContainer === totalVideoListContainer - 1){
		$('#myVideoScrollDown').css({'visibility' : 'hidden'});
	} else { // if(currentVideoListContainer < totalVideoListContainer - 1)
		$('#myVideoScrollDown').css({'visibility' : 'visible'});
	}

	$('.videoListContainer').each(function(index){
		$(this).css({'display' : 'none'});
	});

	$(".videoListContainer:eq(" + currentVideoListContainer + ")").css("display", "");
}


/* start playback request / response
==========================================================================================================*/
function myVideoStartRequest(obj){

	$('#videoInfoPanel').removeClass('showInfo');
	//musicIsPaused = true;
	optionsPanelOpen = false;
	currentVideoTrack = $(".videoTrack").index(obj);
	var videoToPlay = obj.attr('video-data');
	$('#myVideoName').html('Preparing to play...');
	$('#myVideoStatus').html('');
	$('#myMusicMetadata').html('');
	$('#myVideoName').css({'display' : 'block'});
	$('#myVideoStatus').css({'display' : 'block'});
	$('.memErrorMessage').remove();
	$('#widgetContent').prepend($('</div>').addClass('recentPlayedItem').text(currentVideoTrack + ": " + videoToPlay));

	metadataAlbum = null;
	metadataAlbumArtist = null;
	metadataArtist = null;
	metadataComposer = null;
	metadataTitle = null;
	metadataTrackNumber = null;
	metadataComment = null;
	metadataGenre = null;
	metadataAudioCodec = null;
	metadataVideoRatio = null;
	videoHeight = null;
	videoWidth = null;

	localStorage.setItem('videoplayer.currentvideo', JSON.stringify(currentVideoTrack));

	TotalVideoTime = null;
	waitingNext = false;

	if (recentlyPlayed.indexOf(currentVideoTrack) === -1)
	{
		recentlyPlayed.push(currentVideoTrack);
	}
	else
	{
		recentlyPlayed.push(recentlyPlayed.splice(recentlyPlayed.indexOf(currentVideoTrack), 1)[0]);
	}
	//myVideoWs('killall gplay', false); //start-playback

	myVideoWs('sync; for n in 0 1 2 3; do echo $n > /proc/sys/vm/drop_caches; done;', false);

	$('#myVideoList').css({'visibility' : 'hidden'});
	$('#myMusicMetadata').css({'visibility' : 'visible'});
	$('#myVideoScrollDown').css({'visibility' : 'hidden'});
	$('#myVideoScrollUp').css({'visibility' : 'hidden'});
	$('#myVideoInfo').css({'visibility' : 'hidden'});
	$('#toggleBgBtn').css({'visibility' : 'hidden'});


	$('#myVideoShuffleBtn').css({'display' : 'none'});
	$('#myVideoMovieBtn').css({'display' : 'none'});
	$('#myVideoFullScrBtn').css({'display' : 'none'});
	$('#myVideoRepeatBtn').css({'display' : 'none'});
	$('#myVideoRepeatAllBtn').css({'display' : 'none'});
	$('#myPlayMusicBtn').css({'display' : 'none'});
	$('#rebootBtnDiv').css({'display' : 'none'});

	$('#myVideoPreviousBtn').css({'display' : ''});
	$('#myVideoRW').css({'display' : ''});
	$('#myVideoPausePlayBtn').css({'display' : ''});
	$('#myVideoFF').css({'display' : ''});
	$('#myVideoNextBtn').css({'display' : ''});
	$('#myVideoStopBtn').css({'display' : ''});
	$('#myVideoName').html(obj.attr('video-name').replace(/ /g, "&nbsp;"));

	//$('.videoTouchControls').show();
	$('#videoPlayControl').css('cssText', 'display: block !important');
	$('#videoPlayBtn').css({'background-image' : ''});

	try
	{
		src = 'killall -9 gplay; ';
		src += 'sleep 0.3; ';

		if (statusbarTitleVideo) {
			framework.common.setSbName($('#myVideoName').text());
		}
    framework.common.startTimedSbn(this.uiaId, "SbnVPTest", "typeE", {sbnStyle : "Style02",imagePath1 : 'apps/_videoplayer/templates/VideoPlayer/images/icon.png', text1Id : this.uiaId, text2: $('#myVideoName').text()});

		//Screen size 800w*480h
		//Small screen player 700w*367h

		src += '/usr/bin/gplay ';
		//src += '--video-sink="mfw_v4lsink ';

		/* if (!FullScreen)
		{
			src += ' disp-width=700 disp-height=367 axis-left=50 axis-top=64';
		} */

		//src += '" --audio-sink=alsasink ';
		// Trying to asign to specific alsa device or card to take audio focus
		//src += '" --audio-sink="alsasink device=entertainmentBtsa" ';
		src += '"' + videoToPlay + '" 2>&1 ';

		CurrentVideoPlayTime = null;

		wsVideo = new WebSocket('ws://127.0.0.1:9998/');
		wsVideo.onopen = function(){
			//if (PlayMusic)
			//{
				wsVideo.send('/usr/bin/gst-discoverer-0.10 -v "' + videoToPlay + '"');
			//}
			wsVideo.send(src);
		};

		wsVideo.onmessage=function(event)
		{
			checkStatus(event.data);
		};

	}
	catch(err)
	{
	}
}


/* playback next track request
==========================================================================================================*/
function myVideoNextRequest(){

	clearInterval(intervalPlaytime);

	$('#myVideoName').html('');
	$('#myVideoStatus').html('');

	if (!waitingWS)
	{
		waitingWS = true;
		var nextVideoTrack=0;

		//		previousVideoTrack = currentVideoTrack;

		if (currentVideoTrack)
		{
			nextVideoTrack = currentVideoTrack;
		}
		if(!Repeat)
		{
			if (recentlyPlayed.length >= totalVideos)
			{
				if (!RepeatAll)
				{
					myVideoStopRequest();
					waitingWS = false;
					recentlyPlayed = [];
					return;
				}
				else
				{
					recentlyPlayed = [];
				}
			}

			if (Shuffle)
			{
				while (recentlyPlayed.indexOf(nextVideoTrack) !== -1 || nextVideoTrack === currentVideoTrack)
				{
					nextVideoTrack = Math.floor(Math.random() * (totalVideos+1));
				}
			}
			else
			{
				nextVideoTrack++;
				if (nextVideoTrack >= totalVideos)
				{
					nextVideoTrack=0;
				}
			}
		}

		localStorage.setItem('videoplayer.recentlyplayed', JSON.stringify(recentlyPlayed));

		var nextVideoObject = $(".videoTrack:eq(" + nextVideoTrack + ")");

		if(nextVideoObject.length !== 0)
		{
			try
			{
			wsVideo.send('x');
			}
			catch(e)
			{

			}
			myVideoWs('killall -9 gplay', false);
			wsVideo.close();
			wsVideo=null;

			myVideoStartRequest(nextVideoObject);
		}
		else
		{
			myVideoStopRequest();
		}

		waitingWS = false;
	}
}


/* playback previous track request
==========================================================================================================*/
function myVideoPreviousRequest(){

	clearInterval(intervalPlaytime);

	$('#myVideoName').html('');
	$('#myVideoStatus').html('');

	var previousVideoTrack = recentlyPlayed.pop();

	while (previousVideoTrack === currentVideoTrack)
	{
		previousVideoTrack = recentlyPlayed.pop();
		if (previousVideoTrack === null)
		{
			previousVideoTrack = currentVideoTrack;
			break;
		}
	}

	if (!waitingWS)
	{
		waitingWS = true;

		wsVideo.send('x');
		wsVideo.close();
		wsVideo=null;

		var previousVideoObject = $(".videoTrack:eq(" + previousVideoTrack + ")");

		myVideoStartRequest(previousVideoObject);
		waitingWS = false;
	}
}


/* stop playback request / response
==========================================================================================================*/
function myVideoStopRequest(){
  if (statusbarTitleVideo && framework.getCurrentApp() === "_videoplayer") {
    framework.common.setSbName("Video Player");
  }

	if (wsVideo !== null)
	{
		wsVideo.send('x');
		wsVideo.close();
		wsVideo = null;
	}

	clearInterval(intervalPlaytime);

	$('.memErrorMessage').remove();

	$('#myVideoName').html('');
	$('#myVideoStatus').html('');
	VideoPaused = false;
	$('#myVideoPausePlayBtn').css({'background-image' : 'url(apps/_videoplayer/templates/VideoPlayer/images/myVideoPauseBtn.png)'});

	SelectCurrentTrack();

	$('#blackBgn').css({'visibility' : 'hidden'});
	$('#myVideoPreviousBtn').css({'display' : 'none'});
	$('#myVideoRW').css({'display' : 'none'});
	$('#myVideoPausePlayBtn').css({'display' : 'none'});
	$('#myVideoFF').css({'display' : 'none'});
	$('#myVideoNextBtn').css({'display' : 'none'});
	$('#myVideoStopBtn').css({'display' : 'none'});
	$('#myVideoName').css({'display' : 'none'});
	$('#myVideoStatus').css({'display' : 'none'});
	$('#videoPlayControl').css('cssText', 'display: none !important');
	$('#videoPlayBtn').css({'background-image' : ''});

	$('#myVideoShuffleBtn').css({'display' : ''});
	$('#myVideoMovieBtn').css({'display' : ''});
	$('#myVideoFullScrBtn').css({'display' : ''});
	$('#myVideoRepeatBtn').css({'display' : ''});
	$('#myVideoRepeatAllBtn').css({'display' : ''});
	$('#myPlayMusicBtn').css({'display' : ''});
	$('#rebootBtnDiv').css({'display' : ''});

	$('#toggleBgBtn').css({'visibility' : 'visible'});
	$('#myVideoInfo').css({'visibility' : 'visible'});
	$('#myVideoList').css({'visibility' : 'visible'});
	$('#myMusicMetadata').css({'visibility' : 'hidden'});
	myVideoListScrollUpDown('other');
}


/* Play/Pause playback request / response
==========================================================================================================*/
function myVideoPausePlayRequest(){

	if (!waitingWS)
	{
		waitingWS = true;
		wsVideo.send('a');

		if(VideoPaused)
		{
			VideoPaused = false;
			$('#myVideoPausePlayBtn').css({'background-image' : 'url(apps/_videoplayer/templates/VideoPlayer/images/myVideoPauseBtn.png)'});
			$('#videoPlayBtn').css({'background-image' : ''});
		}
		else
		{
			VideoPaused = true;
			$('#myVideoPausePlayBtn').css({'background-image' : 'url(apps/_videoplayer/templates/VideoPlayer/images/myVideoPlayBtn.png)'});
			$('#videoPlayBtn').css({'background-image' : 'url(apps/_videoplayer/templates/VideoPlayer/images/video-play.png)'});
		}

		waitingWS = false;
	}
}

/* FF playback request / response
==========================================================================================================*/
function myVideoFFRequest(){

	if ((!waitingWS) && (CurrentVideoPlayTime))
	{
		waitingWS = true;

		if (CurrentVideoPlayTime > 0 && CurrentVideoPlayTime + 11 < TotalVideoTime)
		{
			CurrentVideoPlayTime = CurrentVideoPlayTime + 10;
		}
		else
		{
			CurrentVideoPlayTime = TotalVideoTime - 1;
		}

		wsVideo.send('e 1 t' + CurrentVideoPlayTime);
		wsVideo.send('h');
		waitingWS = false;
	}
}

/* RW playback request / response
==========================================================================================================*/
function myVideoRWRequest(){

	if ((!waitingWS) && (CurrentVideoPlayTime))
	{
		waitingWS = true;
		CurrentVideoPlayTime = CurrentVideoPlayTime - 10;

		if (CurrentVideoPlayTime < 0)
		{
			CurrentVideoPlayTime = 0;
		}

		wsVideo.send('e 1 t' + CurrentVideoPlayTime);
		wsVideo.send('h');
		waitingWS = false;
	}
}


/*toggles fullscreen during playback
==========================================================================================================*/
function fullScreenRequest()
{
	if (!waitingWS)
	{
		waitingWS = true;

		if (!metadataVideoRatio)
		{
			metadataVideoRatio = (800/480);
		}
		
		if (FullScreen === 0) 
		{
			//FullScreen = false;
			//$('#myVideoFullScrBtn').css({'background-image' : boxUncheck});
			$('#blackBgn').css({'visibility' : 'hidden'});

			// if (stretchVideo)
			// {
				// wsVideo.send('z 50 64 700 367');
			// }
			if (metadataVideoRatio > (800/368)) //wider and taller than 367/ width fixed to 800
			{
				videoHeight = Math.round(800 / metadataVideoRatio);
				var videoPosy = Math.round((480 - videoHeight)/2);
				wsVideo.send('z 0 ' + videoPosy + ' 800 ' + videoHeight);
			}
			else
			{
				videoWidth = Math.round(368 * metadataVideoRatio);
				var videoPosx = Math.round((800 - videoWidth)/2);
				wsVideo.send('z ' + videoPosx + ' 64 ' + videoWidth + ' 368');
			}
		}
		//}
		else
		{
			//FullScreen = true;
			//$('#myVideoFullScrBtn').css({'background-image' : boxChecked});
			$('#blackBgn').css({'visibility' : 'visible'});
			
			if (FullScreen === 1)
			{
				if (metadataVideoRatio > (800/480)) //wider / width fixed to 800
				{
					videoHeight = Math.round(800 / metadataVideoRatio);
					var videoPosy = Math.round((480 - videoHeight)/2);
					wsVideo.send('z 0 ' + videoPosy + ' 800 ' + videoHeight);
				}
				else //height fixed to 480
				{
					videoWidth = Math.round(480 * metadataVideoRatio);
					var videoPosx = Math.round((800 - videoWidth)/2);
					wsVideo.send('z ' + videoPosx + ' 0 ' + videoWidth + ' 480');
				}
			}
			else
			{
				wsVideo.send('z 0 0 800 480');
			}
		}

		localStorage.setItem('videoplayer.fullscreen', JSON.stringify(FullScreen));
		waitingWS = false;
	}
}


/* check Status
============================================================================================= */
function checkStatus(state)
{
	var res = state.trim();

	if (res.indexOf("Playing  ]") !== -1)
	{
	res = res.substring(res.indexOf("Vol=") + 8, res.indexOf("Vol=") + 25);
	$('#myVideoStatus').html(res);
	}
	else if (res.indexOf("fsl_player_play") !== -1)
	{
		//if ((!PlayMusic) && (!FullScreen))
		if (!PlayMusic)
		{
			//wsVideo.send('z 50 64 700 367');
			if (FullScreen !== 2)
			{
				fullScreenRequest();  
			}
		}
		
		CurrentVideoPlayTime = 0;
		startPlayTimeInterval();
	}
	else if (res.indexOf("try to play failed") !== -1 || res.indexOf("ERR]") !== -1)
	{
		showMemErrorMessage(res);
	}
	//else if ((!metadataVideoRatio) && (res.indexOf("width=") !== -1))
	// {
		// res = res.split(",");
		////video/x-h264, parsed=(boolean)true, width=(int)854, height=(int)480, framerate=(
		////metadataWidth = res[2].split(")")[1];
		////metadataHeight = res[3].split(")")[1];
	
		// metadataVideoRatio = (res[2].split(")")[1])/(res[3].split(")")[1]); //ratio W/H
	//}
	else if ((!videoHeight) && (res.indexOf("Height: ") !== -1))
	{
		videoHeight = res.substring(8);
		metadataVideoRatio = videoWidth / videoHeight; //ratio W/H
	}
	else if ((!videoHeight) && (res.indexOf("Width: ") !== -1))
	{
		videoWidth = res.substring(7);
	}
	else if (res.indexOf("fsl_player_stop") !== -1)
	{
		myVideoNextRequest();
	}
	else if ((!metadataTitle) && (res.indexOf("title: ") !== -1))
	{
		metadataTitle = res.substring(7);
		DisplayMetadata();
	}
	else if ((!metadataAlbumArtist) && (res.indexOf("album artist: ") !== -1))
	{
		metadataAlbumArtist = res.substring(14);
		DisplayMetadata();
	}
	else if ((!metadataAlbum) && (res.indexOf("album: ") !== -1))
	{
		metadataAlbum = res.substring(7);
		DisplayMetadata();
	}
	else if ((!metadataArtist) && (res.indexOf("artist: ") !== -1))
	{
		metadataArtist = res.substring(8);
		DisplayMetadata();
	}
	else if ((!metadataComposer) && (res.indexOf("composer: ") !== -1))
	{
		metadataComposer = res.substring(10);
		DisplayMetadata();
	}
	else if ((!metadataTrackNumber) && (res.indexOf("track number: ") !== -1))
	{
		metadataTrackNumber = res.substring(13);
		DisplayMetadata();
	}
	else if ((!metadataGenre) && (res.indexOf("genre: ") !== -1))
	{
		metadataGenre = res.substring(7);
		DisplayMetadata();
	}
	else if ((PlayMusic) && (!metadataAudioCodec) && (res.indexOf("audio codec: ") !== -1))
	{
		metadataAudioCodec = res.substring(13);
		DisplayMetadata();
	}
	else if ((!metadataComment) && (res.indexOf("comment: ") !== -1))
	{
		metadataComment = res.substring(9);
		DisplayMetadata();
	}
	else if ((!TotalVideoTime) && ((res.indexOf("Duration: ") !== -1) || (res.indexOf("Duration  : ") !== -1)))
	{
		res = res.split(":");
		TotalVideoTime = Number(res[1]*3600) + Number(res[2]*60) + Number(res[3].substring(0,2));
	}
}


/* Display Metadata
============================================================================================= */
function DisplayMetadata()
{
	var txt = "<table>";
	if (metadataTitle)
	{
		txt += '<tr><td>Title</td><td>' + metadataTitle + '</td></tr>';
	}
	if (metadataArtist)
	{
		txt += '<tr><td>Artist</td><td>' + metadataArtist + '</td></tr>';
	}
	if (metadataAlbumArtist)
	{
		txt += '<tr><td>Album Artist</td><td>' + metadataAlbumArtist + '</td></tr>';
	}
	if (metadataComposer)
	{
		txt += '<tr><td>Composer</td><td>' + metadataComposer + '</td></tr>';
	}
	if (metadataAlbum)
	{
		txt += '<tr><td>Album</td><td>' + metadataAlbum + '</td></tr>';
	}
	if (metadataGenre)
	{
		txt += '<tr><td>Genre</td><td>' + metadataGenre + '</td></tr>';
	}
	if (metadataTrackNumber)
	{
		txt += '<tr><td>Track Number</td><td>' + metadataTrackNumber + '</td></tr>';
	}
	if (metadataAudioCodec)
	{
		txt += '<tr><td>Audio Codec</td><td>' + metadataAudioCodec + '</td></tr>';
	}
	if (metadataComment)
	{
		txt += '<tr><td>Comment</td><td>' + metadataComment + '</td></tr>';
	}

	txt += '</table>';

	$("#myMusicMetadata").html(txt);
}


/* Select Current Track
============================================================================================= */
function SelectCurrentTrack()
{
	$(".videoTrack").removeClass(vpColorClass);
	if ((currentVideoTrack === null) || (currentVideoTrack > totalVideos -1))
	{
		currentVideoTrack = 0;
	}

	selectedItem = currentVideoTrack;
	currentVideoTrack = null;
	$(".videoListContainer:eq(" + currentVideoListContainer + ")").css("display", "none");
	currentVideoListContainer = ((selectedItem) / 8) >> 0;

	$(".videoListContainer:eq(" + currentVideoListContainer + ")").css("display", "");
	$(".videoTrack").eq(selectedItem).addClass(vpColorClass);

	myVideoListScrollUpDown('other');// moved from 4 lines above
}

function showMemErrorMessage(res){
	$('#videoPlayControl').hide();
	$('#myVideoName').css({'font-size':'16px','padding':'2px'}).html("Memory Error.- " + res);
	$('#myVideoContainer').append('<div id="memErrorMessage" class="memErrorMessage"><b>***************&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; MEMORY ERROR.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;***************</b><br>'+res.substring(res.indexOf("[ERR]"))+'<br>TRY PLAYING THE NEXT VIDEO<br>TO AVOID THIS ERROR REMOVE NAV SD CARD BEFORE PLAYING VIDEOS.<br><br>IF ERRORS CONTINUE TAP THIS MESSAGE TO REBOOT<br><br>BEST VIDEO FORMAT TO MINIMIZE MEMORY ERRORS: <br><div style="font-size:30px;font-weight:bold;">MP4 H264 AAC 360P</div><br><ul></ul></div>');
	if(res !== "test"){
		$('#myVideoNextBtn').css({'display' : ''});
		$('.memErrorMessage').click(function(){
			$('.memErrorMessage').html("<div style='font-size:40px'>REBOOTING</div>");
			myRebootSystem();
		});
	} else {
		$('.memErrorMessage').click(function(){
			$('.memErrorMessage').remove();
		});
	}
}


/* Control Playback
============================================================================================= */
function startPlayTimeInterval()
{
	intervalPlaytime = setInterval(function (){
		wsVideo.send('h');

		if (!VideoPaused)
		{
			CurrentVideoPlayTime++;
		}
	}, 1000);
}


/* function to handle the commander
============================================================================================= */
function handleCommander(eventID)
{
	switch(eventID) {

		case "down":
		if (optionsPanelOpen)
		{
			$('#myVideoInfoClose').click();
		}
		else if (currentVideoTrack === null)
		{
			if((currentVideoListContainer + 1) < totalVideoListContainer)
			{
				$('#myVideoScrollDown').click();

				$(".playbackOption").css("background-image", function(i, val){return val.substring(0, val.indexOf(")")+1);});
				$(".videoTrack").removeClass(vpColorClass);

				selectedItem += 8;

				if (selectedItem >= totalVideos)
				{
					selectedItem = totalVideos - 1;
				}

				$(".videoTrack").eq(selectedItem).addClass(vpColorClass);
			}
			else if ((currentVideoListContainer + 1) === totalVideoListContainer)
			{
				$(".videoTrack").removeClass(vpColorClass);
				selectedItem = totalVideos - 1;
				$(".videoTrack").eq(selectedItem).addClass(vpColorClass);
			}
		}
		else
		{
			$('#myVideoStopBtn').click();
		}
		break;

		case "up":
		if (optionsPanelOpen)
		{
			$('#myVideoInfoClose').click();
		}
		else if (currentVideoTrack === null)
		{
			if (currentVideoListContainer > 0)
			{
				$('#myVideoScrollUp').click();

				$(".playbackOption").css("background-image", function(i, val){return val.substring(0, val.indexOf(")")+1);});
				$(".videoTrack").removeClass(vpColorClass);
				selectedItem -= 8;
				$(".videoTrack").eq(selectedItem).addClass(vpColorClass);
			}
			else if (currentVideoListContainer === 0)
			{
				$(".videoTrack").removeClass(vpColorClass);
				selectedItem = 0;
				$(".videoTrack").eq(selectedItem).addClass(vpColorClass);
			}
		}
		else
		{
			//FullScreen = !FullScreen;
			if (FullScreen === 0)
			{
				FullScreen = 1;
			}
			else if (FullScreen === 1)
			{
				FullScreen = 2;
			}
			else
			{
				FullScreen = 0;
			}
			$('#myVideoFullScrBtn').css('background-image', 'url(apps/_videoplayer/templates/VideoPlayer/images/myFullScreen' + FullScreen + '.png)');
			fullScreenRequest();
		}
		break;

		case "ccw":
		if (optionsPanelOpen)
		{
      $('#colorThemes a').css({'background':''});
			$(".panelOptions a").removeClass(vpColorClass);
			(selectedItem < 0) ? selectedItem = 8 : selectedItem--;
			$(".panelOptions a").eq(selectedItem).addClass(vpColorClass);
		}
		else if (currentVideoTrack !== null)
		{
			$('#myVideoRW').click();
		}
		else
		{
			$(".playbackOption").css("background-image", function(i, val){return val.substring(0, val.indexOf(")")+1);});

			if (selectedItem > 0)
			{
				$(".videoTrack").removeClass(vpColorClass);

				if ((selectedItem % 8) === 0)
				{
					$('#myVideoScrollUp').click();
				}

				selectedItem--;

				$(".videoTrack").eq(selectedItem).addClass(vpColorClass);

			}
			else //if (selectedItem < 0)
			{
				$(".videoTrack").removeClass(vpColorClass);
				selectedItem = totalVideos - 1;
				myVideoListScrollUpDown('bottom');
				$(".videoTrack").eq(selectedItem).addClass(vpColorClass);
			}
		}
		break;

		case "cw":
		if (optionsPanelOpen)
		{
      $('#colorThemes a').css({'background':''});
			$(".panelOptions a").removeClass(vpColorClass);
			(selectedItem > 8) ? selectedItem = 0 : selectedItem++;
			$(".panelOptions a").eq(selectedItem).addClass(vpColorClass);
		}
		else if (currentVideoTrack !== null)
		{
			$('#myVideoFF').click();
		}
		else
		{
			$(".playbackOption").css("background-image", function(i, val){return val.substring(0, val.indexOf(")")+1);});

			if (selectedItem < totalVideos - 1)
			{
				$(".videoTrack").removeClass(vpColorClass);
				selectedItem++;
				$(".videoTrack").eq(selectedItem).addClass(vpColorClass);

				if ((selectedItem > 0) && ((selectedItem % 8) === 0))
				{
					$('#myVideoScrollDown').click();
				}
			}
			else //if (selectedItem >= totalVideos)
			{
				$(".videoTrack").removeClass(vpColorClass);
				selectedItem = 0;
				myVideoListScrollUpDown('top');
				$(".videoTrack").eq(selectedItem).addClass(vpColorClass);
			}
		}
		break;

		case "left":
		if (currentVideoTrack !== null)
		{
			$('#myVideoPreviousBtn').click();
		}
		else if (optionsPanelOpen)
		{
			$('#popInfoTab').click();
		}
		else
		{
			$(".videoTrack").removeClass(vpColorClass);
			$(".playbackOption").css("background-image", function(i, val){return val.substring(0, val.indexOf(")") + 1);});
			selectedOptionItem++;

			//if (selectedOptionItem > 7)
			if (selectedOptionItem >= $(".playbackOption").length)
			{
				selectedOptionItem = 0;
			}

			$(".playbackOption").eq(selectedOptionItem).css("background-image", function(i, val){return val + ", -o-linear-gradient(top," + vphColor + ", rgba(0,0,0,0))";});
		}
		break;

		case "select":
		if (currentVideoTrack !== null)
		{
			$('#myVideoPausePlayBtn').click();
		}
		else if (optionsPanelOpen)
		{
      $(".videoTrack").removeClass(vpColorClass);
			$('.panelOptions .' + vpColorClass).click();
		}
		else
		{
			if ($(".videoTrack").eq(selectedItem).hasClass(vpColorClass))
			{
				myVideoStartRequest($(".videoTrack").eq(selectedItem));
			}
			else
			{
				$('.playbackOption').eq(selectedOptionItem).click();
				$(".playbackOption").eq(selectedOptionItem).css("background-image", function(i, val){return val + ", -o-linear-gradient(top, rgba(0,0,0,0)," + vphColor + ")";});
			}
		}
		break;

		case "right":
		if (currentVideoTrack !== null)
		{
			$('#myVideoNextBtn').click();
		}
		else if (optionsPanelOpen)
		{
			$('#popOptionsTab').click();
		}
		else
		{
			$(".videoTrack").removeClass(vpColorClass);
			$(".playbackOption").css("background-image", function(i, val){return val.substring(0, val.indexOf(")") + 1);});
			selectedOptionItem--;

			if (selectedOptionItem < 0)
			{
				//selectedOptionItem = 7;
				selectedOptionItem = $(".playbackOption").length - 1;
			}

			$(".playbackOption").eq(selectedOptionItem).css("background-image", function(i, val){return val + ", -o-linear-gradient(top," + vphColor + ", rgba(0,0,0,0))";});
		}
		break;

		default:
		return "ignored";
	}
	return "consumed";
}

/* websocket
============================================================================================= */
function myVideoWs(action, waitMessage){

	var ws = new WebSocket('ws://127.0.0.1:9998/');

	ws.onmessage = function(event){
		var res = event.data.trim();

		ws.close();
		ws=null;

		if (res.indexOf('playback-list') !== -1)
		{
			res = event.data.split('//#');
			myVideoListResponse(res[1]);
		}
	};

	ws.onopen = function(){
		ws.send(action);
		if (!waitMessage)
		{
			ws.close();
			ws=null;
		}
	};
}
// #############################################################################################
// End of Video Player
