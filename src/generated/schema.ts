// GENERATED FILE. DO NOT EDIT. Run npm run generate.
export const schemaVersion = "2" as const;
export const schemaFingerprint = "c8bf664c9bf0147d2fea143acc226eeb619ed5ad06f5b0f83fe5c37e429d00bf" as const;
export const datasetFingerprint = "6cf4708e5ba3c75dc0ad16d819a6a1e30fc4725b3e789b2ffb6ffb4a3e1d20ee" as const;

export const normalizedTableColumns = {
  "monsters": [
    "monster_id",
    "name",
    "name_search_key",
    "title",
    "title_search_key",
    "race",
    "monster_type",
    "level",
    "xp_reward",
    "sp_reward",
    "hp",
    "dexterity",
    "strength",
    "mental",
    "wit",
    "intelligence",
    "magic_attack",
    "physical_defense",
    "physical_attack",
    "physical_accuracy_modifier",
    "ground_high_text",
    "ground_low_text",
    "attack_range",
    "is_aggressive",
    "skills_text",
    "herbs_text",
    "sa_text",
    "source_url"
  ],
  "items": [
    "item_id",
    "name",
    "name_search_key",
    "item_type",
    "slot_bit_type",
    "weapon_type",
    "armor_type",
    "crystal_type",
    "crystal_count",
    "title",
    "title_search_key",
    "description",
    "default_price_adena",
    "icon",
    "physical_damage",
    "magical_damage",
    "soulshot_count",
    "spiritshot_count",
    "mp_consume",
    "random_damage",
    "critical",
    "hit_modifier",
    "attack_speed",
    "is_drop",
    "is_trade",
    "source_url"
  ],
  "skills": [
    "skill_id",
    "name",
    "name_search_key",
    "source_url"
  ],
  "skill_levels": [
    "skill_id",
    "skill_level",
    "name",
    "name_search_key",
    "source_url"
  ],
  "skill_attributes": [
    "skill_id",
    "skill_level",
    "attribute_name",
    "attribute_value",
    "source_url"
  ],
  "monster_drops": [
    "monster_id",
    "relationship_index",
    "item_id",
    "item_name",
    "item_name_search_key",
    "item_source_url",
    "quantity_min",
    "quantity_max",
    "probability",
    "source_quantity_text",
    "source_chance_text",
    "raw_text",
    "source_url"
  ],
  "monster_spoils": [
    "monster_id",
    "relationship_index",
    "item_id",
    "item_name",
    "item_name_search_key",
    "item_source_url",
    "quantity_min",
    "quantity_max",
    "probability",
    "source_quantity_text",
    "source_chance_text",
    "raw_text",
    "source_url"
  ],
  "monster_skills": [
    "monster_id",
    "skill_id",
    "skill_level",
    "source_url"
  ],
  "monster_locations": [
    "monster_id",
    "location_index",
    "spawn_location_text",
    "spawn_x",
    "spawn_y",
    "spawn_z",
    "spawn_heading",
    "count",
    "territory_points_json",
    "source_url"
  ]
} as const;
