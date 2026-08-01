/** Estado vacío honesto (RF-5): un 404 de «current» nunca es una pantalla de
 * error — es «la plataforma aún no tiene dato fresco que servir». */
export function NoDataState({ detalle }: { detalle: string }) {
  return <p className="vmw-sin-datos">{detalle}</p>;
}
