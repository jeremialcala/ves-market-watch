# Bundle de CA anclado para bcv.org.ve (ADR-0006)

`bcv-ca-bundle.pem` ancla la cadena de certificación **real** del certificado de
`www.bcv.org.ve`. Contiene, en este orden:

1. Intermedia `Sectigo Public Server Authentication CA DV R36`: emitía el
   certificado del BCV hasta noviembre de 2026. Capturada el 2026-07-05.
2. Raíz `Sectigo Public Server Authentication Root R46`: la autofirmada y dos
   variantes con firma cruzada (USERTrust y AAA Certificate Services). Las tres
   comparten clave.
3. Intermedia `Sectigo Public Server Authentication CA OV R36`: emite el
   certificado actual. Añadida el 2026-11-21, con SHA-256
   `6542d176bed50f193c0ce297ae44ecd8a0a86bec2ede682769344059b4e78530`.

## Por qué existe

El servidor del BCV envía una cadena TLS incorrecta: presenta una intermedia
que no corresponde al emisor de su certificado. Por eso la validación contra el
truststore del sistema falla con `unable to verify the first certificate`, o
`unable to get local issuer certificate`. Este bundle completa la cadena
correcta y **ancla** la CA esperada. Nunca se desactiva la verificación TLS.

## La rotación del 2026-11-13

El BCV renovó su certificado (válido hasta el 2027-05-30) y pasó a emitirlo la
intermedia OV R36, que no estaba en el bundle. **El ingestor dejó de capturar
tasas oficiales unas 50 horas** (alerta `s-bcv` del vigía). El servidor seguía
enviando una intermedia ajena (*Sectigo RSA Domain Validation Secure Server
CA*).

`tests/unit/test_bundle_cadena_real.py` valida, sin red, el certificado de esa
fecha (`tests/fixtures/bcv-leaf-2026-11.pem`) contra el bundle. Con el bundle
anterior falla.

## Qué hacer cuando el BCV rote el certificado

**Se AÑADE la intermedia nueva al final; no se reconstruye el bundle.** Así, si
el BCV vuelve a la intermedia anterior, la captura no se corta otra vez.

```sh
# 1. Leaf actual y URL de su emisor (campo AIA «CA Issuers»)
echo | openssl s_client -connect www.bcv.org.ve:443 -servername www.bcv.org.ve \
  -showcerts 2>/dev/null | awk '/BEGIN CERT/{n++} n==1' | sed -n '/BEGIN/,/END/p' > leaf.pem
openssl x509 -in leaf.pem -noout -issuer -dates -ext authorityInfoAccess

# 2. Bajar la intermedia de esa URL. Es HTTP: no se confía en la descarga hasta
#    el paso 3.
curl -s <URL CA Issuers> -o inter.der
openssl x509 -inform DER -in inter.der -out inter.pem

# 3. VERIFICAR antes de versionar. Las tres comprobaciones:
#  a) firmada por la raíz que ya está anclada
openssl verify -no-CApath -no-CAstore -CAfile bcv-ca-bundle.pem inter.pem
#  b) el leaf encadena con el bundle nuevo (la intermedia AL FINAL)
cat bcv-ca-bundle.pem inter.pem > nuevo.pem
openssl verify -no-CApath -no-CAstore -CAfile nuevo.pem leaf.pem   # leaf.pem: OK
#  c) la huella de la intermedia aparece en crt.sh con el nombre esperado
openssl x509 -in inter.pem -noout -fingerprint -sha256
```

Además, hay que hacer dos cosas:
- **Probar el handshake con el código real,** en la imagen `python:3.12-slim`
  fijada en `scripts/regenerar-locks.sh`, con
  `ssl.create_default_context(cafile="nuevo.pem")` contra `www.bcv.org.ve`.
- **Sustituir el fixture** por el leaf nuevo, con su fecha en el nombre, y
  ajustar `CUANDO` y la cadena esperada en el test.

**Dos trampas, vistas el 2026-11-21:**
- **El orden importa para `openssl verify`.** Con la intermedia al principio,
  elige como emisor una de las R46 con firma cruzada, que comparten clave con
  la autofirmada, y falla con `unable to get issuer certificate` aunque el
  bundle sea correcto. Al final, elige la autofirmada. El handshake de Python
  aceptaba los dos órdenes.
- **`-no-CApath -no-CAstore` es obligatorio.** Sin esas opciones, un truststore
  del sistema que tenga USERTrust puede dar por buena una cadena que el
  ingestor, que solo usa este bundle, rechazaría.

Si alguna verificación falla, **no commitear el bundle.** Hay que investigar si
el BCV cambió de CA (revisar el emisor del leaf) o si hay un intento de MITM.
