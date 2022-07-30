import { Server } from 'socket.io';
import express from 'express';
import { createServer } from 'http';

const app = express();
const server = createServer(app);
const io = new Server();

io.listen(server);

app.use(express.static('public'));

io.on('connection', socket => {
    socket.broadcast.emit('connected');

    socket.on('peer', message => socket.broadcast.emit('peer', message));
    socket.on('disconnect', () => socket.broadcast.emit('peer', { type: 'disconnected' }));
});

server.listen(3000);