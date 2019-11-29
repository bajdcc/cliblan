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
const _ = require('lodash');

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

const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const rankdb = low(adapter);
rankdb.defaults({ records: [] })
    .write();

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
db.exec('CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, uid STRING, enemy STRING NULL, room INT NULL, keyid STRING, createtime STRING, sid INT NULL, name STRING NULL, cls STRING NULL)');
db.exec('CREATE TABLE rooms (id INT PRIMARY KEY, player1 INT, player2 INT, player1_info STRING NULL, player2_info STRING NULL, createtime STRING)');

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
        player1_info: {
            type: GraphQLString
        },
        player2: {
            type: GraphQLInt
        },
        player2_info: {
            type: GraphQLString
        },
        createtime: {
            type: GraphQLString
        }
    })
});
const RankType = new GraphQLObjectType({
    name: 'RankType',
    fields: () => ({
        id: {
            type: new GraphQLNonNull(GraphQLID)
        },
        cls: {
            type: GraphQLString
        },
        name: {
            type: GraphQLString
        },
        win: {
            type: GraphQLInt
        },
        run: {
            type: GraphQLInt
        }
    })
});
const WatchType = new GraphQLObjectType({
    name: 'WatchType',
    fields: () => ({
        room: {
            type: RoomType
        },
        pts: {
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
                return db.exec('select id,uid,enemy,room,keyid,createtime,name,cls,sid from users');
            }
        },
        rooms: {
            type: new GraphQLList(RoomType),
            description: 'Get room list',
            resolve: (_, args) => {
                return db.exec('select id,player1,player1_info,player2,player2_info,createtime from rooms');
            }
        },
        ranks: {
            type: new GraphQLList(RankType),
            description: 'Get rank list',
            resolve: (_, args) => {
                const rk = rankdb.get('records').value();
                const _ranks = _.chain(rk).sortBy(a => a.id).value();
                return _ranks;
            }
        },
        watch: {
            type: WatchType,
            description: 'Get watch',
            args: {
                id: {
                    type: GraphQLInt,
                    description: 'Room id'
                },
                time: {
                    type: GraphQLString,
                    description: 'Time'
                }
            },
            resolve: (_, args) => {
                var id = args.id;
                if (!rooms[id]) return null;
                var ret = {
                    room: db.exec('select id,player1,player1_info,player2,player2_info,createtime from rooms WHERE id = ?', [id])[0],
                    pts: JSON.stringify(rooms[id].pts)
                };
                return ret;
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
    const _users = db.exec('SELECT id,uid,enemy,room,keyid,createtime,cls,name,sid FROM users ORDER BY id LIMIT ' + limit + ' OFFSET ' + page * limit);
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
    const _rooms = db.exec('SELECT id,player1,player2,createtime,player1_info,player2_info FROM rooms LIMIT ' + limit + ' OFFSET ' + page * limit);
    res.end(JSON.stringify({
        code: 0,
        msg: "",
        count: db.exec('SELECT COUNT(*) FROM rooms')[0]["COUNT(*)"],
        data: _rooms
    }));
});
router.get('/rank', (req, res) => {
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
    const rk = rankdb.get('records').value();
    const _ranks = _.chain(rk).sortBy(a => a.id).slice(page * limit).take(limit).value();
    res.end(JSON.stringify({
        code: 0,
        msg: "",
        count: rk.length,
        data: _ranks
    }));
});
router.get('/ping', (req, res) => {
    res.end("pong");
});
app.use('/api2', router);

app.listen(7457);
console.log('start app');

const broadcast = (server, code, info) => {
    //console.log('ws::broadcast', code, info)
    server.connections.forEach(function(conn) {
        conn.sendText(JSON.stringify({ code: code, data: info }))
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
            broadcast(server, "broadcast", obj.data)
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
                    pts: [],
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
        } else if (code === 'game_rank') {
            users[conn.key].st = obj.data.st;
            db.exec('UPDATE users SET name = ?, cls = ?, sid = ? WHERE id = ?', [obj.data.st.stuname, obj.data.st.clsname, obj.data.st.sid, users[conn.key].id]);
            var roomid = users[conn.key].room;
            if (!roomid) return;
            var _room = rooms[roomid];
            if (!_room) return;
            if (_room.p1.id == users[conn.key].id) {
                var p1 = JSON.stringify(db.exec('SELECT cls,name,sid FROM users WHERE id = ?', [_room.p1.id])[0]);
                db.exec('UPDATE rooms SET player1_info = ? WHERE id = ?', [p1, roomid]);
                _room.p2.conn.sendText(JSON.stringify({
                    code: "game_broadcast",
                    data: {
                        code: 1,
                        enemy: "对手为：\n" + obj.data.st.stuname + " " + obj.data.st.sid
                    }
                }));
            } else {
                var p2 = JSON.stringify(db.exec('SELECT cls,name,sid FROM users WHERE id = ?', [_room.p2.id])[0]);
                db.exec('UPDATE rooms SET player2_info = ? WHERE id = ?', [p2, roomid]);
                _room.p1.conn.sendText(JSON.stringify({
                    code: "game_broadcast",
                    data: {
                        code: 1,
                        enemy: "对手为：\n" + obj.data.st.stuname + " " + obj.data.st.sid
                    }
                }));
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
                _room.pts.push(data);
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
                    var rr = (_room.chance == 1 ? _room.p1 : _room.p2);
                    if (rr.st) {
                        var id = parseInt((new Date().getFullYear() + "").slice(2) + rr.st.clsid + ((100 + rr.st.sid) + "").slice(1));
                        if (!rankdb.get('records').find({ id: id }).value()) {
                            rankdb.get('records')
                                .push({ id: id, name: rr.st.stuname, cls: rr.st.clsname, win: 0, run: 0 })
                                .write()
                        }
                        var win = rankdb.get('records').find({ id: id }).value().win;
                        rankdb.get('records')
                            .find({ id: id })
                            .assign({ win: win + 1 })
                            .write();
                        console.log("win", id, win + 1);
                    }
                    var rr2 = (_room.chance != 1 ? _room.p1 : _room.p2);
                    if (rr2.st) {
                        var id = parseInt((new Date().getFullYear() + "").slice(2) + rr2.st.clsid + ((100 + rr2.st.sid) + "").slice(1));
                        if (!rankdb.get('records').find({ id: id }).value()) {
                            rankdb.get('records')
                                .push({ id: id, name: rr2.st.stuname, cls: rr2.st.clsname, win: 0, run: 0 })
                                .write()
                        }
                        var win = rankdb.get('records').find({ id: id }).value().win;
                        rankdb.get('records')
                            .find({ id: id })
                            .assign({ win: win - 1 })
                            .write();
                        console.log("lose", id, win - 1);
                    }
                    (_room.chance == 1 ? _room.p1 : _room.p2).conn.sendText(JSON.stringify({ code: "game_set_player", data: 3 }));
                    (_room.chance == 1 ? _room.p2 : _room.p1).conn.sendText(JSON.stringify({ code: "game_set_player", data: 4 }));
                } else {
                    if (_room.pts.length == r * r) {
                        console.log("full", _room.p1.id, _room.p2.id);
                        (_room.chance == 1 ? _room.p1 : _room.p2).conn.sendText(JSON.stringify({ code: "game_set_player", data: 5 }));
                        (_room.chance == 1 ? _room.p2 : _room.p1).conn.sendText(JSON.stringify({ code: "game_set_player", data: 5 }));
                    } else {
                        (_room.chance == 1 ? _room.p1 : _room.p2).conn.sendText(JSON.stringify({ code: "game_turn_off", data: "123" }));
                        _room.chance = 3 - _room.chance;
                        (_room.chance == 1 ? _room.p1 : _room.p2).conn.sendText(JSON.stringify({ code: "game_turn_on", data: "123" }));
                    }
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
                _room.pts = [];
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
                var rr = users[conn.key];
                if (rr.st) {
                    do {
                        var roomid = users[conn.key].room;
                        if (!roomid) break;
                        var _room = rooms[roomid];
                        if (!_room) break;
                        if (_room.complete) break;
                        if (_room.pts == 0) break;
                        var id = parseInt((new Date().getFullYear() + "").slice(2) + rr.st.clsid + ((100 + rr.st.sid) + "").slice(1));
                        if (!rankdb.get('records').find({ id: id }).value()) {
                            rankdb.get('records')
                                .push({ id: id, name: rr.st.stuname, cls: rr.st.clsname, win: 0, run: 0 })
                                .write()
                        }
                        console.log("run", id);
                        var run = rankdb.get('records').find({ id: id }).value().run || 0;
                        rankdb.get('records')
                            .find({ id: id })
                            .assign({ run: run + 1 })
                            .write();
                    } while (0);
                }
                users[users[conn.key].enemy].conn.sendText(JSON.stringify({ code: "match_disconnect", data: users[conn.key].uid }));
                db.exec("UPDATE users SET enemy = NULL,room = NULL WHERE keyid = ?", [users[conn.key].enemy]);
                db.exec('DELETE FROM rooms WHERE id = ?', [users[users[conn.key].enemy].room]);
                delete users[users[conn.key].enemy].enemy;
                if (users[users[conn.key].enemy]) delete rooms[users[users[conn.key].enemy].room];
                delete users[users[conn.key].enemy].room;
            }
            db.exec('DELETE FROM users WHERE keyid = ?', [conn.key]);
            delete users[conn.key];
        }
        console.info("now users", Object.keys(users).length);
    });
    conn.on('error', function(code) {
        console.log('ws::error', code);
        /*try {
            conn.close('force close');
        } catch (error) {
            console.error('ws::error', error);
        }*/
    });
})

function get_rank(n) {
    var rr = rankdb.get('records');
    var rk = _.chain(rr).filter(a => !/^临时.*/.test(a.name)).sortBy(a => -a.win + a.run).take(n).value();
    return rk;
}

setInterval(function() {
    console.log('broadcast rank');
    broadcast(server, "rank", get_rank(10));
}, 30000);

server.listen(7458);
console.log('start ws');