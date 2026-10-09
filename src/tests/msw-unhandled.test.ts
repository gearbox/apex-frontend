import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { takeUnhandledRequests } from './setup';

let realServer: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) =>
    realServer ? realServer.close(() => resolve()) : resolve(),
  );
  realServer = undefined;
});

it('records an unmocked request and never sends it to the network', async () => {
  const received: string[] = [];
  realServer = createServer((request, response) => {
    received.push(`${request.method} ${request.url}`);
    response.end('real response');
  });
  await new Promise<void>((resolve) => realServer!.listen(0, '127.0.0.1', resolve));
  const { port } = realServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/unmocked`;

  const response = await fetch(url);

  expect(received, 'the request must not reach a listening server').toEqual([]);
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('real response');
  expect(takeUnhandledRequests()).toEqual([`GET ${url}`]);
});
