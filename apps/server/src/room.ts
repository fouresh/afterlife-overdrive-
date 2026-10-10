import { DurableObject } from 'cloudflare:workers';
import { PROTOCOL_VERSION } from '@ao/shared';
import type { Env } from './env';

/**
 * One multiplayer room (party of up to 4). Uses the WebSocket Hibernation API so an idle lobby
 * costs no duration. The authoritative game loop arrives in M3; for now it only greets clients.
 */
export class RoomDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answer keep-alive pings without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION }));
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // M3: decode binary input packets.
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, 'closing');
  }
}
