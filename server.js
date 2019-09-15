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
            appenders: ['col'], level: 'error'
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
db.exec('CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, uid STRING, enemy STRING NULL, keyid STRING)');

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
        key: {
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
                return db.exec('select id,uid,enemy,keyid from users');
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
    const _users = db.exec('SELECT id,uid,enemy,keyid FROM users LIMIT ' + limit + ' OFFSET ' + page * limit);
    res.end(JSON.stringify({
        code: 0,
        msg: "",
        count: Object.keys(users).length,
        data: _users
    }));
});
app.use('/api2', router);

app.listen(8080);
console.log('start app');

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
        if (users[conn.key])
            console.info('ws::text', users[conn.key].id, data);
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
            db.exec('INSERT INTO users VALUES ?', [{
                uid: uid,
                keyid: conn.key,
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
                db.exec("UPDATE users SET enemy = NULL WHERE keyid = ?", conn.key);
                delete users[conn.key].enemy;
            }
            if (users_matching.length >= 1) {
                var enemy = users_matching[0];
                users_matching = users_matching.slice(1);
                users[conn.key].enemy = enemy;
                users[enemy].enemy = conn.key;
                users[enemy].conn.sendText(JSON.stringify({ code: "matched", data: users[conn.key].uid }));
                conn.sendText(JSON.stringify({ code: "matched", data: users[enemy].uid }));
                console.info("user matched", users[conn.key].id, users[enemy].id);
                db.exec("UPDATE users SET enemy = ? WHERE keyid = ?", [users[enemy].id, conn.key]);
                db.exec("UPDATE users SET enemy = ? WHERE keyid = ?", [users[conn.key].id, users[enemy].conn.key]);
            } else {
                console.info("user matching wait", users[conn.key].id);
                users_matching.push(conn.key);
            }
        }
    });
    conn.on('connect', function (code) {
        console.log('ws::connect', code);
    });
    conn.on('close', function (code) {
        console.log('ws::close', code);
        if (users[conn.key]) {
            if (users[conn.key].enemy && users[users[conn.key].enemy] && users[users[conn.key].enemy].enemy) {
                users[users[conn.key].enemy].conn.sendText(JSON.stringify({ code: "match_disconnect", data: users[conn.key].uid }));
                db.exec("UPDATE users SET enemy = NULL WHERE keyid = ?", [users[conn.key].enemy]);
                delete users[users[conn.key].enemy].enemy;
            }
            db.exec('DELETE FROM users WHERE keyid = ?', [conn.key]);
            delete users[conn.key];
        }
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