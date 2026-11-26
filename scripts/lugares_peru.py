# Baja de Overture Maps (datos abiertos) los lugares de Perú y deja un paquete propio: services/datos/lugares_peru.json.gz
# Uso:  pip install duckdb  y luego  python scripts/lugares_peru.py [versión]   (ej. 2026-11-18.0)
# El servidor lo sirve como mapa de lugares (routes/mapa_lugares.js); no depende de ningún servicio externo.
import duckdb, gzip, json, os, sys, urllib.request

def ultima_version():
    with urllib.request.urlopen('https://stac.overturemaps.org/catalog.json', timeout=30) as r:
        c = json.load(r)
    return [l['href'] for l in c['links'] if l['rel'] == 'child'][-1].split('/')[-2]

VERSION = sys.argv[1] if len(sys.argv) > 1 else ultima_version()
CALIDAD_MINIMA = 0.5  # confianza de Overture; por debajo hay muchos comercios dudosos

# grupo -> categorías de Overture
GRUPOS = {
    'combustible': ['gas_station', 'fueling_station'],
    'salud': ['hospital', 'health_care', 'dental_clinic', 'pharmacy_and_drug_store', 'outpatient_care_facility', 'specialized_health_care',
              'primary_care_or_general_clinic', 'specialized_medical_facility', 'medical_service', 'pediatric_clinic', 'diagnostics_imaging_or_lab_service'],
    'educacion': ['place_of_learning', 'education', 'preschool', 'elementary_school', 'middle_school', 'high_school', 'college_university',
                  'specialty_school', 'campus_building', 'educational_service', 'library', 'research_institute'],
    'comida': ['restaurant', 'casual_eatery', 'fast_food_restaurant', 'cafe', 'coffee_shop', 'bar', 'food_truck_stand', 'food_service'],
    'alojamiento': ['hotel', 'lodging', 'private_lodging', 'resort', 'bed_and_breakfast', 'campground'],
    'finanzas': ['bank_or_credit_union', 'atm', 'financial_service'],
    'gobierno': ['government_office', 'police_station', 'fire_station', 'courthouse', 'military_site', 'embassy', 'community_and_government',
                 'civic_organization', 'public_utility'],
    'culto': ['christian_place_of_worship', 'religious_organization'],
    'naturaleza': ['park', 'beach', 'mountain', 'lake', 'river', 'national_park', 'nature_reserve', 'farm', 'playground', 'sport_field',
                   'stadium_arena', 'public_plaza', 'monument', 'historic_site', 'museum', 'geographic_entities', 'sport_court',
                   'swimming_pool', 'amusement_park', 'zoo', 'recreational_trail_or_path', 'cultural_center', 'public_fountain'],
    'transporte': ['airport', 'train_station', 'public_transit_facility_or_service', 'parking', 'b2b_transportation_and_storage_service',
                   'shipping_or_delivery_service', 'storage_facility', 'taxi_or_ride_share_service', 'bridge'],
    'automotriz': ['automotive_service', 'vehicle_parts_store', 'vehicle_service', 'auto_dealer', 'vehicle_dealer'],
    'comercio': ['shopping', 'shopping_mall', 'department_store', 'convenience_store', 'food_and_beverage_store', 'hardware_home_and_garden_store',
                 'wholesaler', 'farmers_market', 'warehouse_club_store'],
}
NOMBRES = list(GRUPOS)
CAT = {c: NOMBRES.index(g) for g, cs in GRUPOS.items() for c in cs}

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
src = f"s3://overturemaps-us-west-2/release/{VERSION}/theme=places/type=place/*"
filas = con.execute(f"""
SELECT names.primary, basic_category, round(ST_X(geometry), 5), round(ST_Y(geometry), 5), round(confidence * 100)::INT
FROM read_parquet('{src}', hive_partitioning=1)
WHERE bbox.xmin BETWEEN -81.5 AND -68.5 AND bbox.ymin BETWEEN -18.5 AND 0.1 AND addresses[1].country = 'PE'
  AND names.primary IS NOT NULL AND coalesce(operating_status, 'open') <> 'closed' AND confidence >= {CALIDAD_MINIMA}
""").fetchall()

puntos = [[x, y, CAT[c], q, n.strip()[:60]] for n, c, x, y, q in filas if c in CAT and n.strip()]
salida = os.path.join(os.path.dirname(__file__), '..', 'services', 'datos', 'lugares_peru.json.gz')
os.makedirs(os.path.dirname(salida), exist_ok=True)
with gzip.open(salida, 'wt', encoding='utf-8', compresslevel=9) as f:
    json.dump({'fuente': 'Overture Maps Foundation (ODbL/CDLA)', 'version': VERSION, 'grupos': NOMBRES, 'puntos': puntos}, f, ensure_ascii=False, separators=(',', ':'))
print(f'{len(puntos)} lugares de {VERSION} -> {os.path.getsize(salida) // 1024} KB')
