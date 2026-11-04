# PRD — Lineage 2 Reborn Legacy Solo Hunt Calculator

**Status:** Approved implementation baseline  
**Scope:** Chronicle 1 only, x1 EXP, solo single-target hunting  
**Primary data source:** <https://lineage2wiki.org/c1/>

## 1. Product summary

Build a ground-up replacement for the existing proof of concept that helps solo players identify suitable monsters to hunt on the Lineage 2 Reborn Legacy server.

The initial interface is a local TypeScript CLI. The calculation engine must remain independent of the CLI so another interface can be added later without rewriting domain logic.

## 2. Delivery layers

Development proceeds through independently accepted layers:

1. Chronicle 1 scraping engine.
2. Raw and normalized CSV datasets.
3. Generated static TypeScript data objects.
4. Pure solo-hunt calculation engine.
5. Interactive and scriptable CLI.
6. Empirical formula verification and later refinements.

A later layer must not compensate for incomplete or invalid earlier data.

## 3. Target user and experience

The primary user understands basic Lineage 2 concepts but should not need to understand hidden formulas or database fields.

The user enters final character-sheet stats after equipment, self-buffs, and consumable effects. The application does not reconstruct equipment, class progression, or every active buff. Character level is mechanically required. Character name and class may be optional labels but have no hidden effect.

The application must:

- Explain why each monster ranked where it did.
- Distinguish scraped, entered, defaulted, provisional, and unavailable values.
- Never represent guessed mechanics as verified.
- Produce identical output for identical data and input.
- Work offline during normal use.

## 4. Solo-hunt definition

A qualifying hunt consists of one character fighting one monster without party members, external buffers or healers, boxed support, pets, summons, or simultaneous targets.

The character may use equipment, self-buffs, consumables, physical basic attacks, and physical or magical skills represented by an attack profile.

V1 supports one repeatable primary attack and an optional basic-attack finisher. Arbitrary skill rotations are excluded.

## 5. Data acquisition

### 5.1 Scope and identity

The scraper collects every Monster, Item, and Skill exposed under `/c1/`, including entities not immediately used by the calculator. Listing pages enumerate entities; detail pages provide complete records and relationships.

Stable numeric wiki IDs are canonical identities. Names and slugs are mutable attributes.

### 5.2 Crawl behavior

Scraping is an explicit build-time maintenance operation. Runtime calculation never contacts the wiki.

Every scrape must:

- Fetch and evaluate `robots.txt` and abort if required paths are disallowed.
- Never permit configuration to bypass `robots.txt`.
- Stay within approved C1 URLs.
- Use one request at a time and wait at least one second between detail requests by default.
- Honor `Retry-After` and use exponential backoff for transient errors.
- Use an honest project-specific user agent.
- Cache responses for resumable runs and support an explicit full refresh.

HTTP parsing is preferred. Browser automation is allowed only for fields proven inaccessible through plain HTTP and embedded page data.

### 5.3 Atomic publication and change detection

Scraping writes into staging. A canonical snapshot is replaced only when every required page succeeds or is satisfied by valid cache, schemas validate, stable IDs are unique, relationships resolve, and source-change checks pass. Partial snapshots are never published.

A change report identifies added, removed, and modified entities and relationships, duplicate IDs, and unusual count changes.

### 5.4 Raw snapshots

Nested data uses relational CSVs rather than arrays encoded inside cells. Expected files include:

- `monsters.csv`
- `monster_drops.csv`
- `monster_spoils.csv`
- `monster_skills.csv`
- `monster_locations.csv`, if available
- `items.csv`
- `skills.csv`
- `skill_levels.csv`, if applicable

Raw values remain faithful to the source. Semantic corrections do not occur in the scraper. Each primary record preserves its source URL. Metadata records retrieval time, C1 base URL, robots result, scraper version, schema version, counts, and hashes.

Git history is the normal snapshot history. Timestamped duplicate snapshots are not accumulated. Images are not downloaded; image URLs may be retained.

## 6. Normalization and static data

The flow is strictly one-way:

`Wiki → raw CSV → normalized CSV + approved overrides → generated TypeScript`

### 6.1 Normalization rules

Normalized data must:

- Retain every source field with understood semantics.
- Use stable numeric IDs and foreign keys.
- Represent unknown values as `null`, never as zero, false, or empty text.
- Use documented canonical units and descriptive `snake_case` CSV fields.
- Split ranges into minimum and maximum fields.
- Store probabilities numerically from `0` through `1` without arbitrary rounding.
- Separate normal drops from spoil.
- Represent skill identity and skill level separately.
- Preserve exact display text and generate separate normalized search keys.
- Reject unknown enum values until reviewed.
- Enforce referential integrity.

Generated TypeScript uses conventional camelCase.

### 6.2 Corrections

Semantic corrections live in version-controlled override CSVs containing entity type, stable ID, field, original value, replacement value, reason, and approval note.

Semantic changes and gameplay interpretations require product-owner approval. Mechanical cleanup such as trimming whitespace does not.

### 6.3 Generated objects

Generation produces separate readonly modules for monsters, items, skills, relationships, and lookup indexes by stable ID.

Generated files are committed, never edited manually, deterministically ordered, and include schema and dataset fingerprints. They do not include volatile timestamps and require no CSV access at runtime.

## 7. Combat model

### 7.1 Player and attack profiles

A player profile stores final character-sheet values after equipment, self-buffs, and consumables. Relevant fields include level, maximum HP and MP, P.Atk, M.Atk, P.Def, M.Def, Attack Speed, Casting Speed, Accuracy, Evasion, Critical, and optional measured recovery values.

An attack profile contains:

- Profile name.
- Physical or magical damage type.
- Basic attack or skill.
- Skill power.
- MP cost per use.
- Observed action duration in seconds.
- Shot type and cost per use.
- Optional basic-attack finisher limit.

Observed duration remains required for per-hour calculations until a speed-conversion formula is approved.

### 7.2 Approved physical damage

\[
physicalDamage =
\frac{70 \times (physicalAttack + skillPower) \times shotMultiplier}
{monsterPhysicalDefense}
\]

- Basic attacks use `skillPower = 0`.
- No Soulshot uses multiplier `1`; Soulshot uses multiplier `2`.
- Internal results retain decimal precision; rounding occurs only for display.

### 7.3 Approved magical damage

\[
magicalDamage =
truncate\left(
\frac{91 \times skillPower \times
\sqrt{magicalAttack \times shotMultiplier}}
{monsterMagicalDefense}
\right)
\]

- No shot uses multiplier `1`.
- Spiritshot uses multiplier `2`.
- Blessed Spiritshot uses multiplier `4`.
- Truncation occurs after the full calculation.
- Monster M.Def comes from scraped wiki data.

Negative stats, negative skill power, nonpositive defenses, and unsupported shot types are invalid.

### 7.4 Provisional XP and SP

Current provisional XP hypothesis:

\[
adjustedXP = baseXP \times
\max\left(0,\frac{100 - 9 \times |playerLevel-monsterLevel|}{100}\right)
\]

Unverified alternative:

\[
adjustedXP = baseXP \times 0.91^{|playerLevel-monsterLevel|}
\]

Applying the chosen XP multiplier to SP is also provisional. Real-server tests must establish whether behavior is linear, compounded, symmetric, and applicable to SP.

### 7.5 Unsupported mechanics

Until separately approved, the calculator does not invent formulas for hit chance, criticals, damage variance, Attack Speed or Casting Speed conversion, HP/MP regeneration, monster incoming DPS, numeric survivability, or stamina.

Unavailable mechanics are disclosed rather than treated as zero. Initial risk output consists only of factual warnings such as level, aggression, social behavior, skills, weaknesses, and resistances.

## 8. Time, recovery, and economy

Per-hour calculations use:

\[
killsPerHour =
\frac{3600}
{combatSeconds + betweenKillSeconds + recoverySeconds}
\]

The user explicitly confirms `betweenKillSeconds`, including zero. Recovery modes are none, fixed average seconds per kill, or measured rates when supported.

MP remains a separate metric and is not assigned an invented adena value. Loot values distinguish raw adena, NPC-sale value, user-configured market value, spoil value, and total configured profit. Unpriced items are shown as **unvalued**, not worthless. Spoil is included only when explicitly enabled for the profile.

## 9. Filtering and ranking

### 9.1 Eligibility filters

Hard filters run before scoring and may include monster level, maximum actions per kill, MP or cost limits, minimum XP, aggression, race/type, weaknesses/resistances, and named/raid/boss inclusion. No hidden “appropriate level” restriction is applied.

### 9.2 Weighted scoring

Enabled metrics become percentile ranks among eligible monsters. Lower-is-better metrics are reversed. Weights total 100%.

Pre-stamina metrics include XP/hour, XP/kill, profit/hour, gross adena value/hour, consumable cost/hour, MP/hour, and kills/hour. Monsters missing an enabled metric are excluded with a reason.

Scores are relative to the active candidate set. Results show filters and candidate count and warn about correlated metrics.

### 9.3 Presets

| Preset | Weights |
|---|---|
| XP-focused | XP/hour 70%; cost/hour 15% reversed; MP/hour 15% reversed |
| Profit-focused | Profit/hour 70%; XP/hour 15%; MP/hour 15% reversed |
| Low-consumption | Cost/hour 40% reversed; MP/hour 40% reversed; XP/hour 20% |
| Balanced | XP/hour 40%; profit/hour 30%; cost/hour 15% reversed; MP/hour 15% reversed |

Custom weights are supported. Risk remains outside scoring until numeric survivability is approved.

### 9.4 Stamina

Once verified, stamina is treated as a finite session budget, enabling kills per allowance, XP and profit per stamina, time to exhaustion, and expected session totals. Until then, stamina metrics remain unavailable and non-stamina rankings remain usable.

## 10. CLI requirements

The Node 24 CLI supports Windows, macOS, and Linux and provides:

- Guided interactive mode.
- Repeatable flags and JSON automation.
- Named, schema-versioned local profiles and a one-off mode.
- Local market-price profiles.
- Hard filters and preset/custom scoring.
- A labeled top-results table, top 20 by default.
- Interactive monster details and full CSV/JSON export.
- Actionable errors, nonzero exit codes, and optional verbose diagnostics.

Noninteractive mode fails when required input is missing rather than prompting. Every ranking screen notes that hourly estimates exclude verified location conditions such as spawn density, competition, terrain, travel, and additional monsters.

Results identify application, dataset, rule-set, and profile fingerprints. No telemetry or external profile transmission is permitted.

Maintenance operations such as `scrape`, `normalize`, `generate`, `verify-data`, and `diff-data` remain separate from normal user commands.

## 11. Rule governance

Every gameplay rule is **Approved**, **Provisional**, **Unverified**, or **Rejected**.

| Rule | Status |
|---|---|
| Physical damage | Approved |
| Magical damage | Approved |
| Shot multipliers | Approved |
| Linear 9%-per-level XP | Provisional |
| Compounded `0.91^levels` XP | Unverified |
| SP penalty | Provisional |
| Polynomial monster M.Def | Rejected |
| XP-per-mana ranking | Rejected |
| Hit and critical mechanics | Unverified |
| Automatic action timing | Unverified |
| Regeneration | Unverified |
| Stamina | Unverified |

Every rule records evidence, inputs, units, boundaries, examples, and approval status.

## 12. Acceptance and quality gates

The project uses Node 24, npm, strict TypeScript, and Jest, with linting, formatting, and generated-data drift checks.

Acceptance requires:

- Complete, polite, robots-compliant C1 crawling.
- Atomic publication and deterministic CSV/TypeScript generation.
- Unique IDs, valid foreign keys, and strict schema boundaries.
- CI rejection of non-C1 entities and URLs.
- Golden tests for every approved and provisional formula.
- A pure engine without terminal, filesystem, or network dependencies.
- Stable filtering, scoring, tie-breaking, and machine-readable exclusions.
- Unit and integration coverage for ranking presets and CLI flows.
- No live network for normal builds, tests, generation checks, or use.
- No committed caches, profiles, exports, staging, or temporary files.

Performance targets on the committed C1 dataset are under two seconds for CLI startup/loading and under one second for calculation/ranking after submission.

## 13. Empirical verification

XP observations record player level; monster ID, name, level, and base XP; actual XP; party/support and stamina state; both predictions; and prediction error.

Stamina testing must establish consumption triggers and amounts, level interactions, affected rewards, allowance, reset behavior, and account/character boundaries before implementation.

Tests demonstrate code conformity to a rule; they do not independently prove that the rule matches the server.

## 14. Explicitly out of scope

- Chronicles other than C1 or EXP rates other than x1.
- Party play, external support, pets, and summons.
- AoE, multi-target farming, and arbitrary rotations.
- Debuff, crowd-control, and kiting simulation.
- Location, spawn-density, competition, terrain, and route modeling.
- Automatic equipment or buff reconstruction.
- Player-market scraping.
- Web, mobile, or hosted APIs.
- Accounts, telemetry, and cloud synchronization.
- Image downloading.
- Speculative post-C1 abstractions.

Future expansion requires an explicit approved scope change.

## 15. Rewrite and repository policy

Old implementation files remain only until each replacement layer passes its acceptance gate. Obsolete source, tests, generated data, and root artifacts are then removed rather than maintained in parallel.

- Replace `temporary_file` with versioned named profiles.
- Remove `tmp_rovodev_formula_refinement.ts`.
- Remove polynomial M.Def estimation.
- Retain existing formulas only where explicitly approved.
- Preserve no compatibility obligation for proof-of-concept prompts or persisted settings.

Commit raw CSVs, normalized CSVs, overrides, manifests, generated TypeScript, and small fixtures. Exclude HTML caches, staging files, profiles, prices, and exports.

Preserve source attribution. Public redistribution of the scraped dataset requires a separate source-terms and licensing review.

## 16. Approval

This PRD is approved as the implementation baseline. Material changes to product scope, gameplay rules, data-source policy, or acceptance gates require explicit review and approval.
