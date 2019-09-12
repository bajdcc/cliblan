var express = require('express');
var app = new express();

app.use(express.static('static'));

app.listen(8080);
console.log('start app');

var users = {};

const broadcast = (server, info) => {
    console.log('ws::broadcast', info)
    server.connections.forEach(function (conn) {
        conn.sendText(JSON.stringify({ code: "broadcast", data: info }))
    })
}

var ws = require('nodejs-websocket');
var uuid = require('node-uuid');
var server = ws.createServer(function (conn) {
    console.info("new connection")
    conn.on('text', function (data) {
        console.info('ws::text', data);
        let obj = JSON.parse(data);
        let code = obj.code;
        if (code === 'close') {
            try {
                conn.close(obj.data);
            } catch (error) {
                console.error('ws::error', error);
            }
        } else if (code === 'broadcast') {
            broadcast(server, obj.data)
        } else if (code === 'hello') {
            var uid = uuid.v1();
            users[conn.key] = {
                uid: uid,
                conn: conn
            };
            console.info("new users", uid);
            conn.sendText(JSON.stringify({ code: "uid", data: uid }));
            console.info("now users", Object.keys(users).length);
        }
    });
    conn.on('connect', function (code) {
        console.log('ws::connect', code);
    });
    conn.on('close', function (code) {
        console.log('ws::close', code);
        if (users[conn.key])
            delete users[conn.key];
        console.info("now users", Object.keys(users).length);
    });
    conn.on('error', function (code) {
        console.log('ws::error', code);
        try {
            conn.close('force close');
        } catch (error) {
            console.error('ws::error', error);
        }
    });
})

server.listen(8081);
console.log('start ws');