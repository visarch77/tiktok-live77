const { WebSocketServer } = require('ws');

/**
 * WebSocket hub: mỗi màn hình kết nối /ws?room=<id> chỉ nhận sự kiện của phòng đó.
 * Client cũng gửi được lệnh JSON-RPC 2.0 qua cùng kết nối (mặc định nhắm vào phòng đang xem).
 */
class Hub {
  /**
   * @param {import('http').Server} server
   * @param {{
   *   verifyOrigin: (origin: string, host: string) => boolean,
   *   resolveRoom: (roomId: string) => string | null,
   *   getInitialState: (roomId: string) => any,
   *   handleRpc: (method: string, params: any, roomId: string) => Promise<any>
   * }} opts
   */
  constructor(server, { verifyOrigin, resolveRoom, getInitialState, handleRpc }) {
    this.handleRpc = handleRpc;
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      // Trình duyệt luôn gửi Origin khi mở WebSocket -> chặn trang web lạ điều khiển phòng qua ws://localhost
      verifyClient: ({ origin, req }) => verifyOrigin(origin, req.headers.host)
    });

    this.wss.on('connection', (ws, req) => {
      let requested = '';
      try {
        requested = new URL(req.url, 'http://localhost').searchParams.get('room') || '';
      } catch (_) {}
      ws.roomId = resolveRoom(requested);
      ws.on('error', (err) => console.warn('[WS] Lỗi client:', err.message));

      if (ws.roomId) {
        this.send(ws, { jsonrpc: '2.0', method: 'room.state', params: getInitialState(ws.roomId) });
      } else {
        this.send(ws, { jsonrpc: '2.0', method: 'room.notFound', params: { roomId: requested } });
      }

      ws.on('message', async (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString('utf8'));
        } catch (_) {
          return;
        }
        if (!msg || !msg.method || ws.readyState !== 1) return;
        try {
          const result = await this.handleRpc(msg.method, msg.params || {}, ws.roomId);
          if (msg.id !== undefined) this.send(ws, { jsonrpc: '2.0', id: msg.id, result });
        } catch (err) {
          if (msg.id !== undefined) {
            this.send(ws, { jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: err.message || 'RPC Error' } });
          }
        }
      });
    });
  }

  send(ws, obj) {
    // Bỏ qua client quá chậm (OBS bị treo...) để bộ đệm gửi không phình to vô hạn
    if (ws.readyState === 1 && ws.bufferedAmount < 4 * 1024 * 1024) {
      ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
    }
  }

  broadcastRoom(roomId, method, params) {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
    for (const client of this.wss.clients) {
      if (client.roomId === roomId) this.send(client, payload);
    }
  }

  broadcastAll(method, params) {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
    for (const client of this.wss.clients) this.send(client, payload);
  }
}

module.exports = { Hub };
