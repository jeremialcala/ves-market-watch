import type { Senal } from "../api/endpoints";
import { formatDecimal } from "../lib/decimal";

/** Evidencia completa de una señal: regla versionada + insumos exactos +
 * cadena de trazabilidad (T10/ADR-0015) — el «por qué» auditable. */
export function SignalEvidenceModal({
  senal,
  onCerrar,
}: {
  senal: Senal;
  onCerrar: () => void;
}) {
  return (
    <div className="modal-fondo" onClick={onCerrar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Evidencia de ${senal.type}`}
        onClick={(evento) => evento.stopPropagation()}
      >
        <h2>
          {senal.type.replaceAll("_", " ")} · {senal.direction}
        </h2>
        <p className="detalle">
          Regla <code>{senal.evidence.rule}</code> · cálculo v
          {senal.calc_version} · dato de las {senal.as_of} · emitida{" "}
          {senal.emitted_at}
        </p>
        <table>
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(senal.evidence.inputs).map(([indicador, valor]) => (
              <tr key={indicador}>
                <td>
                  <code>{indicador}</code>
                </td>
                <td>
                  {typeof valor === "string"
                    ? formatDecimal(valor, { maxDecimales: 4 })
                    : String(valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="detalle">
          Disparada por el evento <code>{senal.triggered_by}</code>
        </p>
        <button type="button" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
