import { describe, expect, it } from 'vitest';
import { asuntoCon, htmlDe, textoCon } from './plantillas.service';

const valores = { nombre: { texto: 'Ana <b>' }, link_seguimiento: { texto: 'ver mi pedido', url: 'https://x.test/p/1' } };

describe('plantillas de email', () => {
  it('reemplaza variables y escapa lo que escribe la tienda y los datos de la clienta', () => {
    const html = htmlDe('Hola {{nombre}} <script>\nSeguilo: {{link_seguimiento}}\n\nOtro párrafo {{desconocida}}', valores);
    expect(html).toBe('<p>Hola <strong>Ana &lt;b&gt;</strong> &lt;script&gt;<br>Seguilo: <a href="https://x.test/p/1">ver mi pedido</a></p><p>Otro párrafo {{desconocida}}</p>');
  });
  it('en asunto y texto plano los links van como dirección', () => {
    expect(asuntoCon('Hola {{ nombre }}', valores)).toBe('Hola Ana <b>');
    expect(textoCon('Mirá {{link_seguimiento}}', valores)).toBe('Mirá https://x.test/p/1');
  });
});
