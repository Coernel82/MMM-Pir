/** PIR library **/
/** bugsounet **/

var log = () => { /* do nothing */ };
const Utils = require("./utils");

class PIR {
  constructor (config, callback) {
    this.config = config;
    this.callback = callback;
    this.default = {
      debug: false,
      gpio: 21,
      mode: 0,
      triggerMode: "LH"
    };
    this.config = Object.assign({}, this.default, this.config);
    if (this.config.debug) log = (...args) => { console.log("[MMM-Pir] [LIB] [PIR]", ...args); };
    this.pir = null;
    this.running = false;
    this.pirReadyToDetect = false;
    if (Utils.isWin()) {
      console.log("[MMM-Pir] [LIB] [PIR] [Windows] Pir library Disabled.");
      if (this.config.gpio) this.config.gpio = 0;
    }
  }

  start () {
    if (this.running) return;
    if (this.config.gpio === 0) return console.log("[MMM-Pir] [LIB] [PIR] Disabled.");
    switch (this.config.triggerMode) {
      case "LH":
        console.log("[MMM-Pir] [LIB] [PIR] triggerMode LH Selected: Read LOW (0, no-motion) to HIGH (1, motion)");
        break;
      case "H":
        console.log("[MMM-Pir] [LIB] [PIR] triggerMode H Selected: Read HIGH (1, motion)");
        break;
      default:
        console.warn(`[MMM-Pir] [LIB] [PIR] triggerMode: ${this.config.mode} is not a valid value`);
        console.warn("[MMM-Pir] [LIB] [PIR] set triggerMode LH");
        this.config.triggerMode = "LH";
        break;
    }
    switch (this.config.mode) {
      case 0:
        console.log("[MMM-Pir] [LIB] [PIR] Mode 0 Selected (gpiod library)");
        this.gpioDetect();
        break;
      case 1:
        console.log("[MMM-Pir] [LIB] [PIR] Mode 1 Selected (gpiozero)");
        this.gpiozeroDetect();
        break;
      default:
        console.warn(`[MMM-Pir] [LIB] [PIR] mode: ${this.config.mode} is not a valid value`);
        console.warn("[MMM-Pir] [LIB] [PIR] set mode 0");
        this.config.mode = 0;
        this.gpioDetect();
        break;
    }
  }

  stop () {
    if (!this.running) return;
    if (this.config.mode === 0 && this.pir) {
      this.pir.unexport();
      this.pir = null;
    }

    if (this.config.mode === 1) {
      this.pir.kill();
    }

    this.pir = null;
    this.running = false;
    this.callback("PIR_STOP");
    log("Stop");
  }

  gpiozeroDetect () {
    const { PythonShell } = require("python-shell");
    let options = {
      mode: "text",
      scriptPath: __dirname,
      pythonOptions: ["-u"],
      args: ["-g", this.config.gpio]
    };

    this.pir = new PythonShell("MotionSensor.py", options);
    this.callback("PIR_STARTED");
    console.log("[MMM-Pir] [LIB] [PIR] Started!");
    this.pirReadyToDetect = true;
    this.running = true;

    this.pir.on("message", (message) => {
      // detect pir
      switch (message) {
        case "Motion":
          log("Debug: Motion detect ready is", this.pirReadyToDetect);
          if (this.pirReadyToDetect) {
            log("Motion Detected");
            this.callback("PIR_DETECTED");
            if (this.config.triggerMode === "LH") {
              this.pirReadyToDetect = false;
              log("Debug: Set motion detect ready to:", this.pirReadyToDetect);
            }
          }
          break;
        case "NoMotion":
          log("No Motion Detected");
          this.pirReadyToDetect = true;
          log("Debug: Set motion detect ready to:", this.pirReadyToDetect);
          break;
        default:
          console.error("[MMM-Pir] [LIB] [PIR] ", message);
          this.callback("PIR_ERROR", message);
          this.running = false;
          break;
      }
    });

    this.pir.on("stderr", (stderr) => {
      // handle stderr (a line of text from stderr)
      if (this.config.debug) console.error("[MMM-Pir] [LIB] [PIR]", stderr);
      this.running = false;
    });

    this.pir.end((err, code, signal) => {
      if (err) {
        console.error("[MMM-Pir] [LIB] [PIR] [PYTHON]", err);
        this.callback("PIR_ERROR", err.message);
      }
      console.warn(`[MMM-Pir] [LIB] [PIR] [PYTHON] The exit code was: ${code}`);
      console.warn(`[MMM-Pir] [LIB] [PIR] [PYTHON] The exit signal was: ${signal}`);
    });
  }

  /* experimental */

  gpioDetect () {
    try {

      const Gpio = require('onoff').Gpio;
      let edge = "";
      if (this.config.triggerMode === "H") {
        edge = "both";
      } else {
        edge = "rising";
      }

      this.pir = new Gpio(this.config.gpio, 'in', edge);
      this.callback("PIR_STARTED");
      console.log("[MMM-Pir] [LIB] [PIR] Started!");

      this.pir.watch((err, value) => {
        if (err) {
          console.error(`[MMM-Pir] [LIB] [PIR] [GPIOD] ${err}`);
          this.callback("PIR_ERROR", err);
        }

        log(`Sensor read value: ${value}`);
        if (value === 1) {
          this.callback("PIR_DETECTED");
          log("Detected presence");
        }
      });
    } catch (err) {
      console.error(`[MMM-Pir] [LIB] [PIR] [ONOFF] ${err}`);
      this.running = false;
      return this.callback("PIR_ERROR", err.message);
    }

    this.running = true;
  }
}

module.exports = PIR;
