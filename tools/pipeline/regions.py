"""Region definitions for data packs. New region = new entry here, no code changes.

must_have_peaks: canonical English name -> spellings that may appear in any OSM name tag
  (name, name:en, int_name, alt_name, old_name, name:ne). A match also gives the peak its
  canonical display name and makes it "famous" (rank 1).
viewpoints: each entry points at one OpenStreetMap element (type/id) that was chosen by
  looking at the cached Overpass results. Coordinates always come from OSM, never typed in.
  osm=None means no source found yet -> written as TODO and left out of viewpoints.json.
"""

REGIONS: dict[str, dict] = {
    "annapurna": {
        "name": "Annapurna & Pokhara",
        "north": 29.4,
        "south": 27.6,
        "west": 83.0,
        "east": 85.0,
        "resolution_arcsec": 3,
        "must_have_peaks": {
            "Annapurna I": ["Annapurna I", "Annapurna", "Annapurna Main", "अन्नपूर्ण", "अन्नपूर्णा", "अन्नपूर्णा I"],
            "Annapurna II": ["Annapurna II", "अन्नपूर्णा II", "अन्नपूर्ण II"],
            "Annapurna III": ["Annapurna III", "अन्नपूर्णा III", "अन्नपूर्ण III"],
            "Annapurna IV": ["Annapurna IV", "अन्नपूर्णा IV", "अन्नपूर्ण IV"],
            "Annapurna South": ["Annapurna South", "Annapurna Dakshin", "Moditse"],
            "Gangapurna": ["Gangapurna", "गङ्गापुर्ण", "गंगापूर्ण"],
            "Hiunchuli": ["Hiunchuli", "Hiun Chuli", "Hiunchuli Peak"],
            "Machhapuchhre": ["Machhapuchhre", "Machapuchare", "Machhapuchchhre", "Machhapuchare", "Machhapuchhare", "Fishtail", "माछापुच्छ्रे"],
            "Gandharba Chuli": ["Gandharba Chuli", "Gandharva Chuli", "Gandharbha Chuli", "Gandharba"],
            "Tent Peak (Tharpu Chuli)": ["Tent Peak", "Tharpu Chuli", "Tharpu Chuli (Tent Peak)"],
            "Lamjung Himal": ["Lamjung Himal", "Lamjung"],
            "Manaslu": ["Manaslu", "मनास्लु"],
            "Himalchuli": ["Himalchuli", "Himal Chuli", "Himachuli"],
            "Dhaulagiri I": ["Dhaulagiri I", "Dhaulagiri", "धौलागिरी", "धौलागिरि"],
            "Tukuche Peak": ["Tukuche Peak", "Tukuche"],
            "Nilgiri North": ["Nilgiri North", "Nilgiri"],
            "Tilicho Peak": ["Tilicho Peak", "Tilicho"],
            "Mardi Himal": ["Mardi Himal"],
        },
        "viewpoints": [
            {"id": "sarangkot", "name": "Sarangkot", "osm": "node/3485963579"},
            {"id": "world-peace-pagoda", "name": "World Peace Pagoda", "osm": "way/596603713"},
            {"id": "pokhara-lakeside", "name": "Pokhara Lakeside (Phewa)", "osm": "node/4161865224"},
            {"id": "pumdikot", "name": "Pumdikot", "osm": "node/4666814990"},
            {"id": "australian-camp", "name": "Australian Camp", "osm": "node/1366597402"},
            {"id": "dhampus", "name": "Dhampus", "osm": "node/988616263"},
            {"id": "poon-hill", "name": "Poon Hill", "osm": "way/366056404"},
            {"id": "ghandruk", "name": "Ghandruk", "osm": "node/388572114"},
            {"id": "annapurna-base-camp", "name": "Annapurna Base Camp", "osm": "way/620058337"},
            {"id": "machhapuchhre-base-camp", "name": "Machhapuchhre Base Camp", "osm": "way/620058338"},
            {"id": "mardi-himal-high-camp", "name": "Mardi Himal High Camp", "osm": "node/1747989125"},
        ],
        # Name filter for the single cached viewpoint-candidate query (case-insensitive regex).
        "viewpoint_search": (
            "Sarangkot|Sarankot|Peace Pagoda|Shanti Stupa|Lakeside|Phewa|Fewa|Pumdikot|Pumdi|"
            "Australian Camp|Australia Camp|Dhampus|Dhampush|Poon Hill|Poonhill|Ghandruk|Ghandrung|"
            "Base Camp|Basecamp|High Camp|Mardi"
        ),
    },
}
