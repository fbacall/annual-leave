var express = require('express');
var app = express();
var port = process.env.PORT || 3006;

app.use(express.static('public'));
console.log("Serving on port: " + port)
app.listen(port);
