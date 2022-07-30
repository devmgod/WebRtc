
import { io } from 'https://cdn.socket.io/4.5.1/socket.io.esm.min.js';

document.addEventListener('DOMContentLoaded', async () => {
    const connectedDevices = [];

    let peerConnection;

    const connectDevice = async (type, deviceId) => {
        const constraints = {
            audio: { audio: {} },
            camera: { video: { width: 384, height: 216, frameRate: 24 } },
            screen: { video: { width: 1920, height: 1080, frameRate: 24 } }
        }; 

        if (deviceId) constraints[type][type == 'audio' ? 'audio' : 'video'].deviceId = deviceId;

        const stream = await navigator.mediaDevices.getUserMedia(constraints[type]);
        const id = stream.getTracks()[0].getSettings().deviceId;

        if (!connectedDevices.some(e => e.type == type)) connectedDevices.push({ id, type, stream, senders: [] });
        else {
            const device = connectedDevices.find(device => device.type == type);

            device.stream.getTracks().forEach(track => track.stop());
            device.senders.forEach(e => e.replaceTrack(stream.getTracks()[0]).catch());

            device.id = id;
            device.stream = stream;

            enumerateDevices();
        }
    }

    const enumerateDevices = async () => {
        const devices = await navigator.mediaDevices.enumerateDevices();

        select_audio.innerHTML = null;
        select_camera.innerHTML = null;
        select_screen.innerHTML = null;

        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label;

            if (device.kind == 'audioinput') select_audio.appendChild(option);
            if (device.kind == 'videoinput') {
                select_camera.appendChild(option);
                select_screen.appendChild(option.cloneNode(true));
            }
        });

        connectedDevices.forEach(e => {
            if (e.type == 'audio') select_audio.value = e.id;
            if (e.type == 'camera') select_camera.value = e.id;
            if (e.type == 'screen') select_screen.value = e.id;
        })

        localStorage.setItem('devices', encodeURIComponent(JSON.stringify(connectedDevices.map(e => { return { id: e.id, type: e.type } }))))
    }

    const createPeerConnection = () => {
        deletePeerConnection();

        peerConnection = new RTCPeerConnection();
        peerConnection.onicecandidate = e => !e.candidate || socket.emit('peer', { type: 'iceCandidate', iceCandidate: e.candidate });
        peerConnection.ontrack = e => {
            if (!audio_remote.srcObject) audio_remote.srcObject = e.streams[0]
            else if (!camera_remote.srcObject) camera_remote.srcObject = e.streams[0];
            else if (!screen_remote.srcObject) {
                screen_container.classList.add('visible');
                screen_remote.srcObject = e.streams[0];
            }
        }

        connectedDevices.forEach(device => device.stream.getTracks().forEach(track => device.senders.push(peerConnection.addTrack(track, device.stream))));

        return peerConnection;
    }

    const deletePeerConnection = () => {
        if (peerConnection) peerConnection.close();
        audio_remote.srcObject = null;
        camera_remote.srcObject = null;
        screen_remote.srcObject = null;
        screen_container.classList.remove('visible');
    }

    const _savedDevices = localStorage.getItem('devices');
    const savedDevices = _savedDevices ? JSON.parse(decodeURIComponent(_savedDevices)) : ['audio', 'camera', 'screen'].map(type => { return { type } });

    for (let device of savedDevices) await connectDevice(device.type, device.id);

    await enumerateDevices();

    const socket = io();

    socket.on('connected', async () => {
        peerConnection = createPeerConnection();

        const offer = await peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveAudio: true });
        await peerConnection.setLocalDescription(offer);

        socket.emit('peer', { type: 'offer', offer });
    });

    socket.on('peer', async message => {
        console.log(message);

        if (message.type == 'offer') {
            peerConnection = createPeerConnection();

            await peerConnection.setRemoteDescription(message.offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            socket.emit('peer', { type: 'answer', answer });
        }

        if (message.type == 'answer') await peerConnection.setRemoteDescription(message.answer);

        if (message.type == 'iceCandidate') peerConnection.addIceCandidate(message.iceCandidate);

        if (message.type == 'disconnected') deletePeerConnection();
    });

    select_audio.onchange = () => connectDevice('audio', select_audio.value);
    select_camera.onchange = () => connectDevice('camera', select_camera.value);
    select_screen.onchange = () => connectDevice('screen', select_screen.value);
});