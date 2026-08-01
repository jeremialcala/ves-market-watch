import { useT } from "../../i18n/contexto";

export function Footer() {
  const t = useT();
  return (
    <footer className="vmw-footer">
      <div className="vmw-footer__contenido vmw-contenedor">
        <span>{t("footer.derechos", { anio: new Date().getFullYear() })}</span>
        <a href="https://higerotech.com" target="_blank" rel="noopener">
          higerotech.com
        </a>
        <span className="vmw-nav__relleno" />
        <span>
          {t("footer.hechoCon1")}
          <span style={{ color: "var(--coral)" }}> ♥ </span>
          {t("footer.hechoCon2")}
        </span>
      </div>
    </footer>
  );
}
