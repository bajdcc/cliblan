const express = require('express');
const path = require('path');
const alasql = require('alasql');
const graphqlHTTP = require('express-graphql');
const compression = require('compression');
const favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const log4js = require("log4js");

log4js.configure({
    appenders: {
        col: {
            type: 'console'
        }
    },
    categories: {
        default: {
            appenders: ['col'],
            level: 'error'
        }
    },
    replaceConsole: true
});

const app = new express();

app.use(express.static('static'));
app.use(favicon(path.join(__dirname, 'static', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(require('less-middleware')(path.join(__dirname, 'static')));
app.use(compression());
app.use(log4js.connectLogger(log4js.getLogger("col"), { level: log4js.levels.INFO }));

const db = new alasql.Database();
db.exec('CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, uid STRING, enemy STRING NULL, room INT NULL, keyid STRING, createtime STRING)');
db.exec('CREATE TABLE rooms (id INT PRIMARY KEY, player1 INT, player2 INT, createtime STRING)');

const {
    GraphQLID,
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLString,
    GraphQLNonNull,
    GraphQLList,
    GraphQLBoolean,
    GraphQLInt,
    GraphQLFloat,
    GraphQLEnumType,
    GraphQLInputObjectType,
    GraphQLUnionType,
} = require('graphql/type');

const UserType = new GraphQLObjectType({
    name: 'UserType',
    fields: () => ({
        id: {
            type: new GraphQLNonNull(GraphQLID)
        },
        uid: {
            type: GraphQLString
        },
        enemy: {
            type: GraphQLInt
        },
        room: {
            type: GraphQLInt
        },
        key: {
            type: GraphQLString
        },
        createtime: {
            type: GraphQLString
        }
    })
});
const RoomType = new GraphQLObjectType({
    name: 'RoomType',
    fields: () => ({
        id: {
            type: new GraphQLNonNull(GraphQLID)
        },
        player1: {
            type: GraphQLInt
        },
        player2: {
            type: GraphQLInt
        },
        createtime: {
            type: GraphQLString
        }
    })
});

const queryType = new GraphQLObjectType({
    name: 'RootQueryType',
    fields: () => ({
        users: {
            type: new GraphQLList(UserType),
            description: 'Get user list',
            resolve: (_, args) => {
                return db.exec('select id,uid,enemy,room,keyid,createtime from users');
            }
        },
        rooms: {
            type: new GraphQLList(RoomType),
            description: 'Get room list',
            resolve: (_, args) => {
                return db.exec('select id,player1,player2,createtime from rooms');
            }
        }
    })
});

const mutationType = new GraphQLObjectType({
    name: 'RootMutationType',
    fields: {
        test: {
            type: GraphQLInt
        }
    }
});

const schema = new GraphQLSchema({
    query: queryType,
    mutation: mutationType
});

var api = graphqlHTTP({
    schema: schema,
    graphiql: true,
});
app.use('/api', api);

var users = {}; // key => id
var users_matching = [];
var rooms_id = 1;
var rooms = {};

const router = express.Router();
router.get('/user', (req, res) => {
    var page = req.query.page || 1;
    if (!/^\d+$/.test(page + ""))
        return res.end(JSON.stringify({ code: 400, msg: "wrong page" }));
    var limit = req.query.limit || 10;
    if (!/^\d+$/.test(limit + ""))
        return res.end(JSON.stringify({ code: 400, msg: "wrong limit" }));
    page = parseInt(page);
    page--;
    if (page <= 0) page = 0;
    limit = parseInt(limit);
    if (limit < 1) limit = 1;
    const _users = db.exec('SELECT id,uid,enemy,room,keyid,createtime FROM users LIMIT ' + limit + ' OFFSET ' + page * limit);
    res.end(JSON.stringify({
        code: 0,
        msg: "",
        count: Object.keys(users).length,
        data: _users
    }));
});
router.get('/room', (req, res) => {
    var page = req.query.page || 1;
    if (!/^\d+$/.test(page + ""))
        return res.end(JSON.stringify({ code: 400, msg: "wrong page" }));
    var limit = req.query.limit || 10;
    if (!/^\d+$/.test(limit + ""))
        return res.end(JSON.stringify({ code: 400, msg: "wrong limit" }));
    page = parseInt(page);
    page--;
    if (page <= 0) page = 0;
    limit = parseInt(limit);
    if (limit < 1) limit = 1;
    const _rooms = db.exec('SELECT id,player1,player2,createtime FROM rooms LIMIT ' + limit + ' OFFSET ' + page * limit);
    res.end(JSON.stringify({
        code: 0,
        msg: "",
        count: db.exec('SELECT COUNT(*) FROM rooms')[0]["COUNT(*)"],
        data: _rooms
    }));
});
router.get('/ping', (req, res) => {
    res.end("pong");
});
app.use('/api2', router);

app.listen(8080);
console.log('start app');

const broadcast = (server, info) => {
    console.log('ws::broadcast', info)
    server.connections.forEach(function(conn) {
        conn.sendText(JSON.stringify({ code: "broadcast", data: info }))
    })
}

var ws = require('nodejs-websocket');
var uuid = require('node-uuid');
const r = 20;
var server = ws.createServer(function(conn) {
    console.info("new connection")
    conn.on('text', function(data) {
        if (users[conn.key])
            console.info('ws::text', users[conn.key].id, data);
        let obj = JSON.parse(data);
        let code = obj.code;
        if (!code) return;
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
            db.exec('INSERT INTO users VALUES ?', [{
                uid: uid,
                keyid: conn.key,
                createtime: new Date().toLocaleString()
            }]);
            var id = db.exec('SELECT id FROM users WHERE keyid = ?', [conn.key])[0].id;
            users[conn.key] = {
                uid: uid,
                conn: conn,
                id: id
            };
            console.info("new users", id, uid);
            conn.sendText(JSON.stringify({ code: "uid", data: uid }));
        } else if (code === 'matching') {
            if (users[conn.key].enemy && users[users[conn.key].enemy]) {
                conn.sendText(JSON.stringify({ code: "matched", data: users[users[conn.key].enemy].uid }));
                return;
            } else {
                db.exec("UPDATE users SET enemy = NULL,room = NULL WHERE keyid = ?", conn.key);
                delete users[conn.key].enemy;
                delete users[conn.key].room;
            }
            if (users_matching.length >= 1) {
                var enemy = users_matching[0];
                users_matching = users_matching.slice(1);
                if (!users[enemy]) {
                    console.info("user matching wait", users[conn.key].id);
                    users_matching.push(conn.key);
                    return;
                }
                users[conn.key].enemy = enemy;
                users[enemy].enemy = conn.key;
                users[enemy].conn.sendText(JSON.stringify({ code: "matched", data: users[conn.key].uid }));
                conn.sendText(JSON.stringify({ code: "matched", data: users[enemy].uid }));
                console.info("user matched", users[conn.key].id, users[enemy].id);
                db.exec("UPDATE users SET enemy = ?,room = ? WHERE keyid = ?", [users[enemy].id, rooms_id, conn.key]);
                db.exec("UPDATE users SET enemy = ?,room = ? WHERE keyid = ?", [users[conn.key].id, rooms_id, users[enemy].conn.key]);
                db.exec('INSERT INTO rooms VALUES ?', [{
                    id: rooms_id,
                    player1: users[conn.key].id,
                    player2: users[enemy].id,
                    createtime: new Date().toLocaleString()
                }]);
                users[conn.key].room = users[enemy].room = rooms_id;
                var arr = new Array();
                for (var i = 0; i < r; i++) {
                    arr[i] = new Array();
                    for (var j = 0; j < r; j++) {
                        arr[i][j] = 0;
                    }
                }
                rooms[rooms_id] = {
                    maps: arr,
                    chance: 1,
                    p1: users[conn.key],
                    p2: users[enemy],
                    complete: false
                };
                conn.sendText(JSON.stringify({ code: "game_turn_on", data: "123" }));
                users[enemy].conn.sendText(JSON.stringify({ code: "game_turn_off", data: "123" }));
                conn.sendText(JSON.stringify({ code: "game_set_player", data: 1 }));
                users[enemy].conn.sendText(JSON.stringify({ code: "game_set_player", data: 2 }));
                rooms_id++;
            } else {
                console.info("user matching wait", users[conn.key].id);
                users_matching.push(conn.key);
            }
        } else if (code === 'game_go') {
            try {
                var data = JSON.parse(obj.data);
                if (!data.x || !data.y) return;
                var x = data.x,
                    y = data.y;
                if (!(0 < x && x <= r && 0 < y && y <= r)) return;
                var roomid = users[conn.key].room;
                if (!roomid) return;
                var _room = rooms[roomid];
                if (!_room) return;
                if (_room.complete)
                    return conn.sendText(JSON.stringify({ code: "error", data: "棋局已经结束" }));
                var local = _room.chance == 1 ? _room.p1.id : _room.p2.id;
                if (users[conn.key].id != local)
                    return conn.sendText(JSON.stringify({ code: "error", data: "还没轮到你下" }));
                var maps = _room.maps;
                if (maps[x][y] != 0) {
                    return conn.sendText(JSON.stringify({ code: "error", data: "这里不能下" }));
                }
                maps[x][y] = _room.chance;
                _room.p1.conn.sendText(JSON.stringify({
                    code: "game_set",
                    data: {
                        type: _room.chance,
                        pos: data
                    }
                }));
                _room.p2.conn.sendText(JSON.stringify({
                    code: "game_set",
                    data: {
                        type: _room.chance,
                        pos: data
                    }
                }));
                var check_win = function(m, t, xx, yy, rr) {
                    var sums = function(dx, dy) {
                        var _x = xx,
                            _y = yy;
                        _x += dx;
                        _y += dy;
                        var c = 0;
                        for (var i = 1; i <= 4; i++) {
                            if (_x >= 0 && _x < rr && _y >= 0 && _y < rr) {
                                if (m[_x][_y] == t) {
                                    c++;
                                    _x += dx;
                                    _y += dy;
                                } else { break; }
                            } else { break; }
                        }
                        return c;
                    }
                    var dir = [
                        [0, 1],
                        [1, 0],
                        [1, 1],
                        [-1, 1]
                    ];
                    for (var k in dir) {
                        var dd = dir[k];
                        var xd = dd[0],
                            yd = dd[1];
                        if (sums(xd, yd) + sums(-xd, -yd) >= 4) {
                            return true;
                        }
                    }
                    return false;
                }
                if (check_win(maps, _room.chance, x, y, r)) {
                    _room.complete = true;
                    (_room.chance == 1 ? _room.p1 : _room.p2).conn.sendText(JSON.stringify({ code: "game_set_player", data: 3 }));
                    (_room.chance == 1 ? _room.p2 : _room.p1).conn.sendText(JSON.stringify({ code: "game_set_player", data: 4 }));
                } else {
                    (_room.chance == 1 ? _room.p1 : _room.p2).conn.sendText(JSON.stringify({ code: "game_turn_off", data: "123" }));
                    _room.chance = 3 - _room.chance;
                    (_room.chance == 1 ? _room.p1 : _room.p2).conn.sendText(JSON.stringify({ code: "game_turn_on", data: "123" }));
                }
            } catch (e) {
                console.error("Game::game_go error", e);
            }
        } else if (code === 'game_restart') {
            var roomid = users[conn.key].room;
            if (!roomid) return;
            var _room = rooms[roomid];
            if (!_room) return;
            if (_room.complete) {
                _room.complete = false;
                var p = _room.p1;
                _room.p1 = _room.p2;
                _room.p2 = p;
                for (var i = 0; i < r; i++) {
                    for (var j = 0; j < r; j++) {
                        _room.maps[i][j] = 0;
                    }
                }
            }
            var local = _room.chance == 1 ? _room.p1.id : _room.p2.id;
            if (users[conn.key].id == local) {
                var con = _room.chance == 1 ? _room.p1.conn : _room.p2.conn;
                con.sendText(JSON.stringify({ code: "game_turn_on", data: "123" }));
                con.sendText(JSON.stringify({ code: "game_set_player", data: 1 }));
            } else {
                var con = _room.chance == 1 ? _room.p2.conn : _room.p1.conn;
                con.sendText(JSON.stringify({ code: "game_turn_off", data: "123" }));
                con.sendText(JSON.stringify({ code: "game_set_player", data: 2 }));
            }
        }
    });
    conn.on('connect', function(code) {
        console.log('ws::connect', code);
    });
    conn.on('close', function(code) {
        console.log('ws::close', code);
        if (users[conn.key]) {
            if (users[conn.key].enemy && users[users[conn.key].enemy] && users[users[conn.key].enemy].enemy) {
                users[users[conn.key].enemy].conn.sendText(JSON.stringify({ code: "match_disconnect", data: users[conn.key].uid }));
                db.exec("UPDATE users SET enemy = NULL,room = NULL WHERE keyid = ?", [users[conn.key].enemy]);
                db.exec('DELETE FROM rooms WHERE id = ?', [users[users[conn.key].enemy].room]);
                delete users[users[conn.key].enemy].enemy;
                delete rooms[users[users[conn.key].enemy].room];
                delete users[users[conn.key].enemy].room;
            }
            db.exec('DELETE FROM users WHERE keyid = ?', [conn.key]);
            delete users[conn.key];
        }
        console.info("now users", Object.keys(users).length);
    });
    conn.on('error', function(code) {
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