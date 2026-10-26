"""Generate the test-data files that the SQL phases reference, laid out as Storage paths.

    python supabase/test-data/make_files.py <head_office_company_id> <duqm_company_id>

Writes supabase/test-data/files/{media,documents}/<company_id>/... (gitignored), then upload with:
    npx supabase storage cp -r supabase/test-data/files/media     ss:///media     --linked --experimental -j 8
    npx supabase storage cp -r supabase/test-data/files/documents ss:///documents --linked --experimental -j 8
Paths must match 01_master_fleet.sql (vehicle photos, logos), 02_operations.sql (registration/insurance
PDFs, expense receipts), 03*_invoices.sql (supplier bills) and 04a_payments.sql (remittances).
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HO, DQ = sys.argv[1], sys.argv[2]
OUT = Path(__file__).parent / 'files'

# Must stay in step with the brands array in 01_master_fleet.sql
BRANDS = [
    ('Toyota', 'Land Cruiser 300', 'SUV', 'toyota-land-cruiser'), ('Toyota', 'Hilux Double Cab', 'Pickup', 'toyota-hilux'),
    ('Toyota', 'Hiace', 'Van', 'toyota-hiace'), ('Toyota', 'Coaster', 'Bus', 'toyota-coaster'),
    ('Nissan', 'Patrol', 'SUV', 'nissan-patrol'), ('Nissan', 'Navara', 'Pickup', 'nissan-navara'),
    ('Mitsubishi', 'L200', 'Pickup', 'mitsubishi-l200'), ('Mitsubishi', 'Fuso Canter', 'Truck', 'mitsubishi-canter'),
    ('Isuzu', 'D-Max', 'Pickup', 'isuzu-dmax'), ('Isuzu', 'NPR', 'Truck', 'isuzu-npr'),
    ('Hyundai', 'Tucson', 'SUV', 'hyundai-tucson'), ('Hyundai', 'H-1', 'Van', 'hyundai-h1'),
    ('Ford', 'Ranger', 'Pickup', 'ford-ranger'), ('Volvo', 'FH16', 'Truck', 'volvo-fh16'),
    ('Caterpillar', '320 Excavator', 'Heavy Equipment', 'cat-320'), ('Kia', 'Sorento', 'Hybrid SUV', 'kia-sorento'),
]
COLORS = [(226, 232, 240), (148, 163, 184), (30, 41, 59), (100, 116, 139), (37, 99, 235), (214, 196, 160)]
PLATE_LETTERS = ['AA', 'AB', 'BM', 'DR', 'HS', 'KQ', 'MR', 'SW']


def font(size):
    for name in ('arialbd.ttf', 'arial.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def vehicle_photo(brand, model, kind, idx, path):
    w, h = 960, 600
    img = Image.new('RGB', (w, h), (15, 23, 42))
    d = ImageDraw.Draw(img)
    for y in range(h):  # sky gradient
        t = y / h
        d.line([(0, y), (w, y)], fill=(int(30 + 40 * t), int(64 + 50 * t), int(120 + 60 * t)))
    d.rectangle([0, 430, w, h], fill=(51, 65, 85))  # road
    for x in range(0, w, 120):
        d.rectangle([x + 20, 505, x + 80, 515], fill=(250, 204, 21))
    body = COLORS[idx % len(COLORS)]
    dark = (15, 23, 42)
    if kind in ('Truck', 'Bus', 'Van', 'Heavy Equipment'):
        d.rounded_rectangle([170, 230, 800, 420], 18, fill=body, outline=dark, width=4)
        d.rounded_rectangle([660, 180, 800, 330], 14, fill=body, outline=dark, width=4)
        d.rectangle([680, 200, 785, 270], fill=(147, 197, 253))
        for x in range(200, 640, 90):
            if kind in ('Bus', 'Van'):
                d.rectangle([x, 255, x + 65, 315], fill=(147, 197, 253))
        wheels = [260, 420, 720]
    else:
        d.polygon([(150, 360), (230, 270), (330, 230), (620, 230), (720, 290), (820, 320), (830, 400), (150, 400)],
                  fill=body, outline=dark)
        d.polygon([(260, 285), (345, 245), (460, 245), (460, 300), (260, 300)], fill=(147, 197, 253))
        d.polygon([(480, 245), (600, 245), (680, 300), (480, 300)], fill=(147, 197, 253))
        if kind == 'Pickup':
            d.rectangle([600, 300, 830, 330], fill=body, outline=dark)
        wheels = [280, 690]
    for cx in wheels:
        d.ellipse([cx - 55, 360, cx + 55, 470], fill=dark)
        d.ellipse([cx - 25, 390, cx + 25, 440], fill=(148, 163, 184))
    d.text((40, 40), f'{brand} {model}', font=font(48), fill=(255, 255, 255))
    d.text((40, 100), f'{kind} - Al Hakim Fleet', font=font(28), fill=(203, 213, 225))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'JPEG', quality=82)


def logo(path):
    img = Image.new('RGB', (512, 512), (15, 23, 42))
    d = ImageDraw.Draw(img)
    d.ellipse([56, 56, 456, 456], fill=(16, 185, 129))
    d.text((150, 170), 'AH', font=font(170), fill=(255, 255, 255))
    d.text((120, 400), 'AL HAKIM', font=font(48), fill=(15, 23, 42))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'PNG')


def receipt(n, office, path):
    img = Image.new('RGB', (600, 900), (250, 250, 245))
    d = ImageDraw.Draw(img)
    f, b = font(26), font(34)
    lines = [('AL HAKIM NATIONAL LLC', b), (office, f), ('-' * 34, f), (f'Receipt No: RC-{n:05d}', f),
             ('Date: see expense record', f), ('', f), ('Item                 Amount', f),
             ('Service / fees', f), ('', f), ('-' * 34, f), ('PAID - Thank you', b), ('VAT reg: OM1100482910', f)]
    y = 40
    for text, fnt in lines:
        d.text((40, y), text, font=fnt, fill=(30, 30, 30))
        y += 56
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'JPEG', quality=80)


def pdf(path, title, rows):
    """Minimal single-page PDF (Helvetica text), no external dependency."""
    esc = lambda s: s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    ops = ['BT /F1 20 Tf 56 780 Td (' + esc(title) + ') Tj ET',
           '0.06 0.73 0.51 RG 3 w 56 765 m 540 765 l S']
    y = 730
    for k, v in rows:
        ops.append(f'BT /F1 12 Tf 56 {y} Td ({esc(k)}) Tj ET')
        ops.append(f'BT /F1 12 Tf 230 {y} Td ({esc(str(v))}) Tj ET')
        y -= 24
    ops.append('BT /F1 9 Tf 56 60 Td (Generated test document - Al Hakim National LLC ERP) Tj ET')
    stream = '\n'.join(ops).encode('latin-1')
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream',
            b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    out = bytearray(b'%PDF-1.4\n')
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f'{i} 0 obj\n'.encode() + o + b'\nendobj\n'
    xref = len(out)
    out += f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n'.encode()
    out += b''.join(f'{o:010d} 00000 n \n'.encode() for o in offsets)
    out += f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(out))


counts = {}
for cid, office in ((HO, 'Head Office - Muscat'), (DQ, 'Duqm Office')):
    media, docs = OUT / 'media' / cid, OUT / 'documents' / cid
    for idx, (brand, model, kind, slug) in enumerate(BRANDS):
        vehicle_photo(brand, model, kind, idx, media / 'vehicles' / f'{slug}.jpg')
    logo(media / 'logos' / 'hakim-logo.png')
    for n in range(1, 151):
        receipt(n, office, docs / 'expenses' / f'receipt-{n:03d}.jpg')
    for n in range(1, 101):
        pdf(docs / 'payments' / f'remit-{n:03d}.pdf', 'Payment Remittance Advice',
            [('Office', office), ('Remittance', f'REM-{n:05d}'), ('Method', 'Bank Transfer'), ('Status', 'Paid')])

# Vehicles 1..280 Head Office, 281..400 Duqm (01_master_fleet.sql)
for i in range(1, 401):
    cid = HO if i <= 280 else DQ
    brand, model, kind, _ = BRANDS[(i * 7) % len(BRANDS)]
    code, plate = f'VH-{i:04d}', f'{1000 + i} {PLATE_LETTERS[i % 8]}'
    base = OUT / 'documents' / cid / 'documents'
    pdf(base / f'{code}-registration.pdf', 'Vehicle Registration Card (Mulkiya)',
        [('Vehicle code', code), ('Plate number', plate), ('Make / model', f'{brand} {model}'), ('Type', kind),
         ('Registered in', 'Sultanate of Oman'), ('Owner', 'Al Hakim National LLC')])
    pdf(base / f'{code}-insurance.pdf', 'Motor Insurance Certificate',
        [('Vehicle code', code), ('Plate number', plate), ('Policy', f'POL-{880000 + i:07d}'),
         ('Cover', 'Comprehensive'), ('Insured', 'Al Hakim National LLC')])

# Supplier bills: invoices 1..520 that are purchases (i % 100 < 58); office by i % 10 (03*_invoices.sql)
for i in range(1, 521):
    if i % 100 < 58:
        cid = HO if i % 10 < 7 else DQ
        pdf(OUT / 'documents' / cid / 'invoices' / f'bill-{i:04d}.pdf', 'Supplier Tax Invoice',
            [('Supplier bill', f'SB-{i:05d}'), ('Purchase order', f'PO-{i:05d}'), ('Bill to', 'Al Hakim National LLC'),
             ('VAT', '5%'), ('Terms', 'As per supplier agreement')])

total = sum(1 for _ in OUT.rglob('*') if _.is_file())
print(f'Generated {total} files under {OUT}')
