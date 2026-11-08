-- =====================================================================
-- FLEETX ERP — ADD VEHICLE DETAILS TO SUPABASE
-- Run this in your Supabase SQL Editor to insert the commercial fleet:
-- =====================================================================

insert into public.vehicles (
  id, company_id, vehicle_code, plate_number, registration_number, vin, engine_number,
  vehicle_type, vehicle_category, brand, manufacturer, model, variant,
  manufacturing_year, registration_date, registration_expiry_date, country_of_registration,
  color, fuel_type, transmission, engine_capacity_cc, number_of_seats,
  current_mileage, initial_odometer, status,
  assigned_driver, department, location,
  insurance_provider, insurance_policy_number, insurance_expiry_date, insurance_premium_annual,
  current_market_value, purchase, depreciation, oil_config
)
values
  -- Vehicle 1: Toyota Land Cruiser GXR V6
  ('eeeeeeee-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'VH-001', '1042-A', 'ROP-REG-88210', 'JTEBU71J8M4091283', '1GR-FE-99214',
   'SUV', 'Operations', 'Toyota', 'Toyota Motor Corporation', 'Land Cruiser', 'GXR 4.0L V6',
   2024, '2024-01-15', '2027-01-14', 'Oman',
   'Super White', 'Petrol', 'Automatic', 3956, 7,
   34200, 0, 'Active',
   'Salem Al-Mamari', 'Field Operations', 'Muscat HQ Yard',
   'Dhofar Insurance Company SAOG', 'POL-DH-2024-88192', '2027-01-14', 480.000,
   22000.000,
   '{"purchaseDate":"2024-01-15","purchaseValue":24500,"vendor":"Zubair Automotive LLC"}'::jsonb,
   '{"purchaseValue":24500,"salvageValue":5000,"usefulLifeYears":5,"depreciationMethod":"Straight-Line","annualDepreciationRate":20}'::jsonb,
   '{"serviceIntervalKm":10000,"recommendedOilGrade":"5W-30","oilCapacityLitres":6.8}'::jsonb),

  -- Vehicle 2: Isuzu D-Max Double Cab 4x4
  ('eeeeeeee-0002-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'VH-002', '8821-B', 'ROP-REG-44109', 'MP1TFS85JNT094812', '4JJ3-TCX-8812',
   'Pickup', 'Operations', 'Isuzu', 'Isuzu Motors Ltd', 'D-Max', '3.0L Double Cab LS',
   2023, '2023-03-20', '2026-03-19', 'Oman',
   'Titanium Silver', 'Diesel', 'Manual', 2999, 5,
   58400, 0, 'Active',
   'Rashid Al-Harthy', 'Field Operations', 'Duqm Regional Yard',
   'Oman United Insurance SAOG', 'OUI-DMX-2023-4100', '2026-03-19', 320.000,
   10500.000,
   '{"purchaseDate":"2023-03-20","purchaseValue":12800,"vendor":"Zubair Automotive LLC"}'::jsonb,
   '{"purchaseValue":12800,"salvageValue":2500,"usefulLifeYears":5,"depreciationMethod":"Straight-Line","annualDepreciationRate":20}'::jsonb,
   '{"serviceIntervalKm":10000,"recommendedOilGrade":"15W-40","oilCapacityLitres":8.5}'::jsonb),

  -- Vehicle 3: Mercedes-Benz Actros Prime Mover
  ('eeeeeeee-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'VH-003', '5519-C', 'ROP-REG-11928', 'WDB9340322L849102', 'OM501LA-4491',
   'Truck', 'Logistics', 'Mercedes-Benz', 'Daimler Truck AG', 'Actros', '3340 6x4 Prime Mover',
   2022, '2022-06-10', '2025-06-09', 'Oman',
   'Navy Blue', 'Diesel', 'Automatic', 11946, 2,
   142000, 0, 'Under Maintenance',
   'Tariq Al-Balushi', 'Heavy Logistics', 'Muscat Logistics Yard',
   'National Life & General Insurance', 'NLGI-TRK-2022-9901', '2025-06-09', 1150.000,
   32000.000,
   '{"purchaseDate":"2022-06-10","purchaseValue":42000,"vendor":"Al-Zubair Automotive LLC"}'::jsonb,
   '{"purchaseValue":42000,"salvageValue":8000,"usefulLifeYears":7,"depreciationMethod":"Straight-Line","annualDepreciationRate":14.3}'::jsonb,
   '{"serviceIntervalKm":25000,"recommendedOilGrade":"15W-40","oilCapacityLitres":28}'::jsonb),

  -- Vehicle 4: Toyota Hilux 4x4 Single Cab
  ('eeeeeeee-0004-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'VH-004', '3201-D', 'ROP-REG-77182', 'MROER8CD4P0194821', '2TR-FE-77192',
   'Pickup', 'Operations', 'Toyota', 'Toyota Motor Corporation', 'Hilux', '2.7L 4x4 Manual Single Cab',
   2024, '2024-02-01', '2027-01-31', 'Oman',
   'Polar White', 'Petrol', 'Manual', 2694, 3,
   21800, 0, 'Active',
   'Nasser Al-Farsi', 'Field Operations', 'Muscat HQ Yard',
   'Dhofar Insurance Company SAOG', 'POL-DH-2024-44211', '2027-01-31', 290.000,
   9800.000,
   '{"purchaseDate":"2024-02-01","purchaseValue":11200,"vendor":"Zubair Automotive LLC"}'::jsonb,
   '{"purchaseValue":11200,"salvageValue":2200,"usefulLifeYears":5,"depreciationMethod":"Straight-Line","annualDepreciationRate":20}'::jsonb,
   '{"serviceIntervalKm":10000,"recommendedOilGrade":"10W-40","oilCapacityLitres":5.5}'::jsonb)
on conflict (id) do nothing;

-- Verify inserted vehicles
select id, vehicle_code, plate_number, brand, model, manufacturing_year, current_mileage, status from public.vehicles order by vehicle_code;
