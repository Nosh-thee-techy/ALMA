/**
 * Climatic Impact Cascade — frontend mirror of engine/data/climatic_impact_cascade.json
 *
 * Audience split: NGO gets whatIsHappening + mechanism; farmer gets simplified lines only.
 */
export type CascadeState = "flood_rain" | "flood_dam" | "compound" | "drought";

export type CascadeSectorEntry = {
  whatIsHappening: string;
  mechanism: string;
  farmerWhy: string;
};

export type CascadeBlock = {
  label: string;
  farmerIntro: string;
  livestock: CascadeSectorEntry;
  crops: CascadeSectorEntry;
  soil: CascadeSectorEntry;
  water: CascadeSectorEntry;
  marketEconomic: CascadeSectorEntry;
  health: CascadeSectorEntry;
};

export const climaticImpactCascade: Record<CascadeState, CascadeBlock> = {
  flood_rain: {
    label: "Flood — rainfall driven",
    farmerIntro: "Heavy rain is raising flood risk in your area.",
    livestock: {
      whatIsHappening:
        "Rising water threatens grazing land and can cause drowning. Standing water increases risk of waterborne disease (e.g. liver fluke, foot rot) in livestock.",
      mechanism:
        "Submerged pasture forces herds into unfamiliar or crowded grazing areas, increasing disease transmission and stress-related productivity loss (reduced milk yield).",
      farmerWhy: "Your animals may lose safe grazing and get sick from standing water.",
    },
    crops: {
      whatIsHappening:
        "Waterlogged soil deprives plant roots of oxygen, causing root rot and crop death within days if prolonged. Standing water also promotes fungal disease.",
      mechanism:
        "Saturated soil pores fill with water, cutting off oxygen to root systems; most staple crops (maize, sorghum) cannot survive more than 2–4 days of full waterlogging during active growth stages.",
      farmerWhy: "Your crops can die if fields stay underwater for a few days.",
    },
    soil: {
      whatIsHappening:
        "Fast-moving floodwater strips topsoil and leaches nutrients, reducing land fertility for future planting seasons. Downstream soil porosity and cohesion shape how severe that erosion and leaching become — a land-impact effect, not a dam structural reading.",
      mechanism:
        "Nutrient leaching removes nitrogen and other soluble minerals from the root zone; topsoil erosion removes the most fertile upper soil layer. More porous, less cohesive soils lose material faster under the same flood pulse.",
      farmerWhy: "Floods can wash away good soil, making the next season harder.",
    },
    water: {
      whatIsHappening:
        "Floodwater can contaminate drinking water sources with agricultural runoff, waste, or pathogens.",
      mechanism:
        "Overland flow carries surface contaminants into wells, boreholes, and open water sources used for drinking.",
      farmerWhy: "Drinking water may become unsafe — boil or use a known clean source.",
    },
    marketEconomic: {
      whatIsHappening:
        "Crop and livestock losses reduce household income and local food supply, which can drive short-term price increases for staple foods.",
      mechanism:
        "Reduced local supply combined with damaged market access routes constrains food availability, pushing prices up as household incomes drop.",
      farmerWhy:
        "Food prices may rise while your income falls if harvests or animals are lost.",
    },
    health: {
      whatIsHappening:
        "Flooding increases exposure to contaminated water and crowded shelters, raising disease risk.",
      mechanism:
        "Pathogen-laden floodwater plus disrupted sanitation and health access compounds outbreak risk.",
      farmerWhy: "Keep families away from dirty floodwater when you can.",
    },
  },
  flood_dam: {
    label: "Flood — operational dam release",
    farmerIntro: "An unexpected or elevated dam release is raising flood risk downstream.",
    livestock: {
      whatIsHappening:
        "Sudden river rise from dam release can trap herds on low banks with less warning than local rain alone.",
      mechanism:
        "Dam-driven hydrographs rise faster than rainfall runoff in some reaches; animals on riverine corridors may be cut off before herders relocate.",
      farmerWhy: "Water can rise quickly from the dam — move herds off low riverbanks early.",
    },
    crops: {
      whatIsHappening:
        "Riverbank and floodplain crops face rapid inundation from upstream release, not only local storms.",
      mechanism:
        "Spill increases channel stage downstream on a 12–24h travel window; fields near the Omo corridor flood even when local skies are clear.",
      farmerWhy: "Fields near the river can flood even if it is not raining where you are.",
    },
    soil: {
      whatIsHappening:
        "Fast channel flow erodes banks and deposits silt that can bury seedlings or strip fertile edges. Downstream soil porosity and cohesion shape scour and nutrient leaching once floodwater arrives — land impact, not dam structure (Gibe III is RCC gravity).",
      mechanism:
        "High discharge increases shear stress on banks; sediment load remobilizes after the pulse. More porous, less cohesive soils erode and leach faster under the same release pulse.",
      farmerWhy: "River edges may lose soil or get covered in silt after a surge.",
    },
    water: {
      whatIsHappening:
        "Sudden stage rise can overtop unprotected wells and mix river water with household sources.",
      mechanism:
        "Rapid hydrograph peaks overwhelm informal intake points before communities can seal them.",
      farmerWhy: "Protect drinking water stores before the river rises.",
    },
    marketEconomic: {
      whatIsHappening:
        "Dam-driven floods can cut ferry and road links along the corridor, delaying markets and aid.",
      mechanism:
        "Infrastructure on the floodplain fails under sudden stage; trade volumes drop while perishable goods spoil.",
      farmerWhy: "Markets and transport may shut for days — plan food and cash early.",
    },
    health: {
      whatIsHappening:
        "Rapid inundation increases drowning and injury risk during night-time or surprise rises.",
      mechanism: "Short lead times leave less time for orderly evacuation of low settlements.",
      farmerWhy: "Stay off low ground at night when dam warnings are active.",
    },
  },
  compound: {
    label: "Compound flood — rain and dam together",
    farmerIntro: "Rain and dam release are overlapping — flood risk is higher than either alone.",
    livestock: {
      whatIsHappening:
        "Herds face both local waterlogging and a faster river pulse, leaving fewer safe grazing corridors.",
      mechanism:
        "When rain-wave and dam-surge arrivals overlap within ~24h, inundation depth and duration increase non-linearly.",
      farmerWhy: "Two floods at once leave less safe grazing — move early to known high ground.",
    },
    crops: {
      whatIsHappening:
        "Fields may stay flooded longer, killing crops that might have survived a short single flood.",
      mechanism:
        "Compound severity raises peak stage and prolongs saturation beyond the 2–4 day tolerance of maize/sorghum roots.",
      farmerWhy: "Crops may stay underwater longer — harvest what you can and protect seed.",
    },
    soil: {
      whatIsHappening:
        "Longer inundation deepens nutrient loss and bank collapse along the corridor.",
      mechanism:
        "Extended saturation plus higher peak flow compounds leaching and erosion beyond single-signal events.",
      farmerWhy: "Land may need more recovery time after a compound flood.",
    },
    water: {
      whatIsHappening:
        "Contamination risk lasts longer as floodwater sits and mixes from both sources.",
      mechanism:
        "Dual hydrographs extend the window of overland contaminant transport into domestic sources.",
      farmerWhy: "Treat drinking water carefully for longer after compound floods.",
    },
    marketEconomic: {
      whatIsHappening:
        "Larger simultaneous losses hit household income and local food supply harder; prices often spike while roads stay cut.",
      mechanism:
        "Non-linear impact on production plus corridor transport failure widens the local supply gap.",
      farmerWhy: "Expect harder income and market shocks — prioritize people and animals first.",
    },
    health: {
      whatIsHappening:
        "Higher displacement and longer standing water raise outbreak and injury risk.",
      mechanism:
        "Compound events expand the population exposed and the duration of unsafe water contact.",
      farmerWhy: "Keep children away from floodwater and seek help early if anyone falls ill.",
    },
  },
  drought: {
    label: "Drought / dry spell",
    farmerIntro: "There's a drought affecting your area.",
    crops: {
      whatIsHappening:
        "Insufficient soil moisture stunts growth or causes total crop failure, especially for water-intensive varieties.",
      mechanism:
        "Without adequate water, plants cannot complete photosynthesis and nutrient uptake normally.",
      farmerWhy: "Your crops may not get enough water to grow well.",
    },
    livestock: {
      whatIsHappening:
        "Reduced pasture and water availability leads to malnutrition, lower milk production, and increased mortality risk if drought is prolonged.",
      mechanism:
        "Grazing land dries out and forage quality drops; herders must travel further for water and pasture.",
      farmerWhy: "Your livestock may struggle to find enough grazing and water.",
    },
    soil: {
      whatIsHappening:
        "Dry soil becomes more vulnerable to erosion by wind, and loses structure, making future planting harder even after rain returns.",
      mechanism:
        "Lack of moisture and vegetation cover reduces soil cohesion and water infiltration capacity.",
      farmerWhy: "Dry bare soil can blow away and soak rain poorly later.",
    },
    water: {
      whatIsHappening:
        "Water points dry or concentrate animals, increasing competition and contamination at remaining sources.",
      mechanism:
        "Reduced recharge and higher evaporative demand shrink usable surface/groundwater.",
      farmerWhy: "Known water points matter more — move toward them early.",
    },
    marketEconomic: {
      whatIsHappening:
        "Reduced crop and milk yields shrink household income. Distress sales can temporarily crash livestock prices, then scarcity spikes them later. Food prices generally rise.",
      mechanism:
        "Herders destock early creating short-term oversupply and low prices, followed by shortage once herds are smaller.",
      farmerWhy:
        "Livestock prices may drop temporarily as herders destock — consider timing sales carefully if possible. Food prices often rise.",
    },
    health: {
      whatIsHappening:
        "Reduced food availability and dietary diversity increases malnutrition risk, particularly in children.",
      mechanism:
        "Lower crop and livestock yields reduce both direct food access and household income for food.",
      farmerWhy: "Watch children's meals — less milk and harvest can mean less food at home.",
    },
  },
};

const SECTOR_MAP: Record<string, keyof CascadeBlock> = {
  agriculture: "crops",
  livestock: "livestock",
  fisheries: "water",
  health: "health",
  crops: "crops",
  soil: "soil",
  water: "water",
  marketEconomic: "marketEconomic",
};

export function resolveCascadeState(opts: {
  climaticState?: string | null;
  compoundActive?: boolean;
  tier?: string;
  climateState?: string;
  droughtRisk?: string;
  rainScore?: number;
  damScore?: number;
}): CascadeState {
  if (opts.climaticState && opts.climaticState in climaticImpactCascade) {
    return opts.climaticState as CascadeState;
  }
  const tier = (opts.tier || "safe").toLowerCase();
  const drought = (opts.droughtRisk || "safe").toLowerCase();
  const climate = (opts.climateState || "stable").toLowerCase();
  const rain = opts.rainScore ?? 0;
  const dam = opts.damScore ?? 0;
  const elevated = Boolean(opts.compoundActive) || ["watch", "warning", "severe"].includes(tier);

  if (opts.compoundActive && elevated) return "compound";
  const droughtElevated =
    ["watch", "warning", "severe"].includes(drought) || climate === "dry_spell";
  if (droughtElevated && !elevated) return "drought";
  if (elevated || climate === "wet_trend") {
    return dam > rain + 8 ? "flood_dam" : "flood_rain";
  }
  if (climate === "dry_spell") return "drought";
  return rain >= dam ? "flood_rain" : "flood_dam";
}

export function ngoSectorCascade(state: CascadeState, sector: string) {
  const block = climaticImpactCascade[state];
  const key = SECTOR_MAP[sector] || "crops";
  const entry = block[key as keyof CascadeBlock];
  if (typeof entry === "string") {
    return { whatIsHappening: "", mechanism: "", label: block.label, state };
  }
  return {
    state,
    label: block.label,
    whatIsHappening: entry.whatIsHappening,
    mechanism: entry.mechanism,
  };
}
