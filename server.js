const express = require("express");
const app = express();
const port = 8079;
const doUpdate = require("./index.js")

let lastTimestamp = 0;

app.get("/", (req, res) => {
  console.log("Request received");
  if (Date.now() - lastTimestamp > 10_000) {
    lastTimestamp = Date.now();
    console.log("Request processed");
    doUpdate();
    res.sendStatus(200);
  } else {
    res.sendStatus(429);
  }
});

app.listen(port, () => {
  console.log(`Listening for actions requests`);
});
