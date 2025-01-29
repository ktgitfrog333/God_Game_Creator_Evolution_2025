LibraryCriNc = {

$CriNc: {
	wactx: null,	// WebAudioのAudioContext
	ncvoices: [],
	worklets: [],
	interval: null,
	initPromise: null,
	createPromise: null,
	dataCbFunc: null,
	mainFunc: null,
},
WAJS_Initialize: function() {
	var itf = CriNc.itf = Module["CriNcItf"] = Module["CriNcItf"] || {};

	const audioWorkletCode = `class CriNcVoiceAudioWorkletProcessor extends AudioWorkletProcessor {
		constructor() {
		  super();
		  this.port.onmessage = this.handleMessage.bind(this);
		  this.ncvoice = null;
		  this.totalStoredSamples = 0;
		  this.ringBuffer = [];
		  this.offset = 0;
		}
	  
		handleMessage(event) {
			if(event.data.type == "Init"){
				this.ncvoice = event.data.ncvoice;
			}
			if(event.data.type == "Data"){
				this.ringBuffer.push(event.data.buffers);
				this.totalStoredSamples += event.data.length;
			}
		}
	  
		process(inputs, outputs, parameters) {
		  const output = outputs[0];
		  var outputOffset = 0;
	
		  if(this.totalStoredSamples < 1024){
			this.port.postMessage({ type:"DataRequest", ncvoice: this.ncvoice});
		  }
	
		  while(true){
			var remainedOutput = output[0].length - outputOffset;
			var buffers = this.ringBuffer.shift();
			if(buffers == null){
				for (let channel = 0; channel < output.length; channel++) {
					for(let samples = 0; samples < remainedOutput; samples++){
						output[channel][samples + outputOffset] = 0;
					}
				}
				break;
			}
			var remainedSamples = buffers[0].length - this.offset;
			var samplesToCopy = Math.min(remainedOutput, remainedSamples);
			
			for (let channel = 0; channel < output.length; channel++) {
				for(let samples = 0; samples < samplesToCopy; samples++){
					output[channel][outputOffset + samples] = buffers[channel][this.offset + samples];
				}
			}
			this.totalStoredSamples -= samplesToCopy;
	
			/* バッファー一つを読み終わったとき */
			if(samplesToCopy == remainedSamples){
				this.offset = 0;
			} else {
				this.offset += samplesToCopy;
				this.ringBuffer.unshift(buffers);
			}
	
			outputOffset += samplesToCopy;
			if(outputOffset == output[0].length){
				break;
			}
		  }
	  
		  return true;
		}
	  }
	  
	  registerProcessor('cri-ncvoice-audio-worklet-processor', CriNcVoiceAudioWorkletProcessor);`;
	
	// AudioContextを作成
	if (AudioContext) {
		var context = CriNc.wactx || itf["audioContext"] || new AudioContext({sampleRate: 48000});
		CriNc.initPromise = context.audioWorklet.addModule('data:text/javascript,' + encodeURI(audioWorkletCode));
		
		if(navigator.audioSession){ 
			navigator.audioSession.type = 'auto'; 
		}
		CriNc.wactx = itf["audioContext"] = context;
		var resume = function(){
			if(CriNc.wactx && CriNc.wactx.state != "running"){
				CriNc.wactx.suspend();
				CriNc.wactx.resume();
			}
		};
		window.addEventListener("mousedown", resume);
		window.addEventListener("touchstart", resume);
		document.onvisibilitychange = () => {
			if(!CriNc.wactx) return;
			if (document.visibilityState == "hidden") {
				CriNc.wactx.suspend();
			} else {
				setTimeout(()=>{
					CriNc.wactx.suspend();
					CriNc.wactx.resume();
				}, 200);
			}
		}
	}
},
WAJS_Create: async function(num_channels) {
	var audioWorklet = [];
	var id;
	CriNc.worklets.push(audioWorklet);
	id = CriNc.worklets.indexOf(audioWorklet);

	var createModule = async function(id){
		await CriNc.initPromise;
		audioWorklet = new AudioWorkletNode(CriNc.wactx, "cri-ncvoice-audio-worklet-processor", {outputChannelCount:[num_channels]});
		audioWorklet.channelCount = num_channels;
		audioWorklet.connect(CriNc.wactx.destination);
		CriNc.worklets[id] = audioWorklet;
	}
	CriNc.createPromise = createModule(id);

	return id;
},
WAJS_Finalize: function() {
	CriNc.wactx = null;
	CriNc.initPromise = null;
	CriNc.dataCbFunc = null;
	CriNc.mainFunc = null;
	clearInterval(CriNc.interval);
	CriNc.interval = null;
},
WAJS_Destroy: function(id) {
	CriNc.worklets[id].port.onmessage = null;
	CriNc.worklets[id].disconnect();
	CriNc.worklets.splice(id);
	CriNc.ncvoices[id] = null;
	CriNc.createPromise = null;
},
WAJS_PutData: function(id, dataptr, num_samples) {
	const buffers = [];
	const transferables = [];
	var num_channels = (CriNc.worklets[id])? CriNc.worklets[id].channelCount : 2;
  
	for (let i = 0; i < num_channels; i++) {
	  const bufferptr = Module.HEAPU32[dataptr / Uint32Array.BYTES_PER_ELEMENT + i];
	  const sharedBuffer = new Float32Array(Module.HEAPF32.buffer, bufferptr, num_samples);

	  const buffer = new Float32Array(num_samples);
	  buffer.set(sharedBuffer);
  
	  buffers.push(buffer);
	  transferables.push(buffer.buffer);
	}

	if (CriNc.worklets[id]) {
	  CriNc.worklets[id].port.postMessage({ type: "Data", buffers: buffers, length:num_samples }, transferables);
	}
  },
WAJS_Start: function(id){	
	if(CriNc.worklets[id]){
		CriNc.worklets[id].connect(CriNc.wactx.destination);
	}
},
WAJS_Stop: function(id){
	if(CriNc.worklets[id]){
		CriNc.worklets[id].disconnect();
	}
},
WAJS_Setup: async function(ncv, id){
	await CriNc.createPromise;

	CriNc.ncvoices[id] = ncv;
	var audioWorklet = CriNc.worklets[id];
	audioWorklet.port.postMessage({ type:"Init", ncvoice: ncv });
	audioWorklet.port.onmessage = (event) => {
		if(event.data.type == "DataRequest"){
			if(CriNc.dataCbFunc){
				dynCall("vi", CriNc.dataCbFunc, [event.data.ncvoice]);
			}
		}
	};
	if(CriNc.interval == null){
		if(CriNc.mainFunc){
			CriNc.interval = setInterval(function(){
				dynCall("v", CriNc.mainFunc, []);
			}, 10);
		}
	}
},
WAJS_SetDataCbFunc: function(cbfunc){
	CriNc.dataCbFunc = cbfunc;
},
WAJS_SetMainFunc: function(cbfunc){
	CriNc.mainFunc = cbfunc;
},

};

autoAddDeps(LibraryCriNc, '$CriNc');
mergeInto(LibraryManager.library, LibraryCriNc);
