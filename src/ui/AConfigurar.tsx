/**
 * Aviso "a configurar" (2026-11-18, pedido de ella): una cuenta nueva no hereda datos de nadie.
 * Mientras un área no tenga sus datos base, se muestra esto con el botón que lleva a cargarlos (pilar 6).
 */
export function AConfigurar({ titulo, texto, boton, ruta }: { titulo: string; texto: string; boton: string; ruta: string }) {
  return (
    <section className="a-configurar" role="status">
      <span className="a-configurar-etq">A configurar</span>
      <strong>{titulo}</strong>
      <p>{texto}</p>
      <a className="btn btn-primario" href={ruta}>{boton}</a>
    </section>
  );
}
