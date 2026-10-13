import { createServer } from 'node:http';

export async function startQuizFixture() {
  const server = createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<h2>Output of encryption?</h2><button>Ciphertext</button><button>Plaintext</button><input value="private form value">');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8765, '127.0.0.1', resolve); });
  return server;
}
