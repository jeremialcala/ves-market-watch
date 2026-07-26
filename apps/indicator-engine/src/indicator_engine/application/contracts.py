"""Validación de contratos de eventos contra los schemas compartidos del repo.

Todo evento consumido se valida contra `schemas/<evento>.v1.json` antes de
tocar la lógica de negocio (PRD: ASVS V5.1, A05/A08). Un evento inválido
lanza `EventoInvalido` y el consumidor lo enruta a la DLQ.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError

from indicator_engine.application.ports import SnapshotP2PRecibido, TasaOficialRecibida
from indicator_engine.domain.models import AnuncioP2P


class EventoInvalido(Exception):
    """El mensaje no cumple el contrato del evento — va a la DLQ."""


class ValidadorDeContratos:
    def __init__(self, schemas_dir: str | Path) -> None:
        self._dir = Path(schemas_dir)
        self._validadores: dict[str, Draft202012Validator] = {}

    def _validador(self, nombre_schema: str) -> Draft202012Validator:
        if nombre_schema not in self._validadores:
            ruta = self._dir / nombre_schema
            schema = json.loads(ruta.read_text(encoding="utf-8"))
            Draft202012Validator.check_schema(schema)
            self._validadores[nombre_schema] = Draft202012Validator(schema)
        return self._validadores[nombre_schema]

    def validar_tasa_oficial(self, evento: dict) -> TasaOficialRecibida:
        """Valida un `official.rate.updated` y lo convierte al DTO de aplicación."""
        try:
            self._validador("official-rate.v1.json").validate(evento)
        except ValidationError as exc:
            raise EventoInvalido(
                f"official.rate.updated no cumple el schema: {exc.message}"
            ) from exc

        payload = evento["payload"]
        return TasaOficialRecibida(
            event_id=evento["event_id"],
            moneda=payload["currency"],
            valor=Decimal(payload["rate"]),
            fecha_valor=date.fromisoformat(payload["value_date"]),
            capturada_en=datetime.fromisoformat(payload["captured_at"]),
        )

    def validar_snapshot_p2p(self, evento: dict) -> SnapshotP2PRecibido:
        """Valida un `p2p.snapshot` y lo convierte al DTO de aplicación.

        Solo se proyectan los campos que el motor usa; el resto del anuncio
        (límites, métodos de pago, merchant_ref) no entra a la lógica de cálculo.
        """
        try:
            self._validador("p2p-snapshot.v1.json").validate(evento)
        except ValidationError as exc:
            raise EventoInvalido(
                f"p2p.snapshot no cumple el schema: {exc.message}"
            ) from exc

        payload = evento["payload"]
        return SnapshotP2PRecibido(
            event_id=evento["event_id"],
            side=payload["side"],
            asset=payload["asset"],
            fiat=payload["fiat"],
            capturado_en=datetime.fromisoformat(payload["captured_at"]),
            partial=payload["partial"],
            anuncios=tuple(
                AnuncioP2P(
                    precio=Decimal(ad["price"]),
                    cantidad_disponible=Decimal(ad["available_amount"]),
                    outlier=ad["outlier"],
                    es_merchant=ad["merchant"],
                )
                for ad in payload["ads"]
            ),
        )
