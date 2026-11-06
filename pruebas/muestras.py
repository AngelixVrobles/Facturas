"""Muestras inventadas para las pruebas: dos facturas en PDF y dos fotos de un conduce.

Uso: python3 pruebas/muestras.py <carpeta>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)


def factura(path, lines):
    c = canvas.Canvas(str(path), pagesize=letter)
    y = 740
    for size, text in lines:
        c.setFont("Helvetica-Bold" if size > 11 else "Helvetica", size)
        c.drawString(60, y, text)
        y -= size + 10
    c.showPage()
    c.save()


factura(OUT / "factura-lopez.pdf", [
    (16, "TRANSPORTE Y AGREGADOS S. LOPEZ, SRL"),
    (10, "RNC 130999998 - Km. 8 1/2 Carretera San Fco."),
    (13, "FACTURA DE CREDITO FISCAL"),
    (11, "NCF: B0100000777        Fecha: 05/11/2026"),
    (11, "Cliente: SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.  RNC 104595114"),
    (11, "Obra: Caperuza 2"),
    (11, "Conduce No. 39807 - Grava 5 m3 - 1 viaje ......... RD$ 8,000.00"),
    (13, "TOTAL RD$ 8,000.00"),
])
factura(OUT / "factura-bloques.pdf", [
    (16, "BLOQUES DEL CIBAO, SRL"),
    (10, "RNC 131555777"),
    (13, "FACTURA DE CREDITO FISCAL"),
    (11, "NCF: B0100000888        Fecha: 06/11/2026"),
    (11, "Cliente: SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.  RNC 104595114"),
    (11, "400 blocks de 6 pulgadas"),
    (13, "TOTAL RD$ 4,720.00"),
])


def conduce(path, numero, tono):
    im = Image.new("RGB", (900, 1400), (70, 66, 60))
    d = ImageDraw.Draw(im)
    d.rectangle([90, 80, 810, 1320], fill=tono, outline=(40, 60, 140), width=6)
    font = ImageFont.load_default()
    d.text((140, 130), "TRANSPORTE Y AGREGADOS", fill=(30, 40, 120), font=font)
    d.text((140, 170), f"CONDUCE  {numero}", fill=(160, 30, 30), font=font)
    for k, campo in enumerate(["Cliente", "Placa", "Proyecto", "Material", "Precio", "Viajes", "Metros", "Chofer", "Total RD$"]):
        y = 260 + k * 110
        d.text((140, y), campo + ":", fill=(30, 40, 120), font=font)
        d.line([(300, y + 14), (760, y + 14)], fill=(30, 40, 120), width=3)
    im.save(path, quality=90)


conduce(OUT / "conduce.jpg", "39807", (196, 232, 230))
conduce(OUT / "conduce-2.jpg", "40001", (205, 228, 238))
print("muestras listas en", OUT)
