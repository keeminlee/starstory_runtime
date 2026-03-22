import type { CampaignSummary, SessionDetail, SessionSummary } from "@/lib/types";
import type { HomepageSkyCampaignSummary } from "@/lib/types";
import type { RegistrySnapshotDto } from "@/lib/registry/types";

const DEMO_GUILD_ID = "system-demo";
const DEMO_CAMPAIGN_SLUG = "demo";

/* ────────────────────────────────────────────── Sessions ── */

const DEMO_SESSIONS: SessionSummary[] = [
  {
    id: "demo-s1",
    label: "Arrival at Moonwell Hollow",
    title: "Arrival at Moonwell Hollow",
    date: "2026-03-01",
    status: "completed",
    source: "live",
    sessionOrigin: "showtime",
    isArchived: false,
    artifacts: { transcript: "available", recap: "available" },
    warnings: [],
  },
  {
    id: "demo-s2",
    label: "The Lantern Archive Heist",
    title: "The Lantern Archive Heist",
    date: "2026-03-05",
    status: "completed",
    source: "live",
    sessionOrigin: "showtime",
    isArchived: false,
    artifacts: { transcript: "available", recap: "available" },
    warnings: [],
  },
  {
    id: "demo-s3",
    label: "Ashes on the Duskwater",
    title: "Ashes on the Duskwater",
    date: "2026-03-10",
    status: "completed",
    source: "live",
    sessionOrigin: "showtime",
    isArchived: false,
    artifacts: { transcript: "available", recap: "available" },
    warnings: [],
  },
  {
    id: "demo-s4",
    label: "The Ember Tribunal",
    title: "The Ember Tribunal",
    date: "2026-03-15",
    status: "completed",
    source: "live",
    sessionOrigin: "showtime",
    isArchived: false,
    artifacts: { transcript: "available", recap: "available" },
    warnings: [],
  },
];

/* ────────────────────────────────────────── Session Details ── */

const DEMO_SESSION_DETAILS: Record<string, SessionDetail> = {
  "demo-s1": {
    id: "demo-s1",
    campaignSlug: DEMO_CAMPAIGN_SLUG,
    campaignName: "Demo Campaign",
    label: "Arrival at Moonwell Hollow",
    title: "Arrival at Moonwell Hollow",
    date: "2026-03-01",
    status: "completed",
    source: "live",
    sessionOrigin: "showtime",
    guildId: DEMO_GUILD_ID,
    isArchived: false,
    transcript: [],
    recap: {
      concise:
        "The party descended into Moonwell Hollow, confirmed Ash Knife activity at the old watchtower, and established a base of operations under the guidance of Elder Tessara.",
      balanced:
        "Session one opened with the party traveling through thick fog along a cliffside trail before reaching Moonwell Hollow. Ari scouted the old watchtower and found fresh boot prints, a torn embercloak, and a discarded Ash Knife cipher note — confirming the faction had passed through recently.\n\nThe group approached Elder Tessara at the Moonwell commons to negotiate access to town records and local intelligence. Despite some initial wariness from the townsfolk, Tessara agreed to open the archive wing in exchange for the party investigating disappearances near the Duskwater River.\n\nNox mapped the town perimeter while Kael inspected the local shrine, noting strange residue that matched descriptions of embersalt — a controlled alchemical substance linked to Ash Knife operations. The session ended with the party establishing a command post in the vacant mill house and planning their next move toward the Lantern Archive.",
      detailed:
        "The campaign opened with a tense descent into Moonwell Hollow. Visibility was poor and the cliffside trail offered little cover, forcing the party to move carefully. Ari took point and identified old cairn markers that suggested the path had been used recently by travelers moving quickly — no pack animals, light gear, deliberate spacing between boot prints.\n\nAt the watchtower, Ari discovered three key pieces of evidence: a set of fresh boot prints matching military-issue soles, a torn section of an embercloak still bearing its inner sigil, and a crumpled cipher note wedged into a gap in the stone. The cipher used a substitution pattern the party had seen in prior intelligence briefings about the Ash Knives.\n\nThe party moved into town and sought out Elder Tessara, a figure of quiet authority in Moonwell Hollow. Tessara listened carefully to their account of the watchtower findings and confirmed that strange visitors had passed through roughly two days earlier. She offered conditional access to the town archive — a locked stone chamber beneath the commons hall — if the party would look into a series of disappearances along the Duskwater River that had unsettled the locals.\n\nWhile negotiations continued, Nox slipped away to map the town's perimeter and note defensive gaps. She identified two unguarded approaches from the north — a drainage culvert and an overgrown footpath that connected to the river trail. Meanwhile, Kael visited the local shrine and examined residue on the altar stones. His alchemical training identified it as embersalt, a restricted substance used in Ash Knife rituals to mark territory and suppress local ward magic.\n\nThe session closed with the party claiming the vacant mill house as a temporary command post. They pinned Nox's perimeter map to the wall, catalogued the watchtower evidence, and sketched out a plan to investigate the Lantern Archive — an old records hall on the town's eastern edge that Tessara mentioned had been sealed after the disappearances began.",
      generatedAt: "2026-03-01T19:42:00.000Z",
      modelVersion: "demo-seeded-v1",
    },
    recapReadiness: "ready",
    recapPhase: "complete",
    speakerAttribution: null,
    artifacts: { transcript: "available", recap: "available" },
    warnings: [],
  },
  "demo-s2": {
    id: "demo-s2",
    campaignSlug: DEMO_CAMPAIGN_SLUG,
    campaignName: "Demo Campaign",
    label: "The Lantern Archive Heist",
    title: "The Lantern Archive Heist",
    date: "2026-03-05",
    status: "completed",
    source: "live",
    sessionOrigin: "showtime",
    guildId: DEMO_GUILD_ID,
    isArchived: false,
    transcript: [],
    recap: {
      concise:
        "The party infiltrated the Lantern Archive, bypassed its outer wards, and discovered a hidden ledger chamber linking the Ash Knives to embersalt shipments through the Duskwater trade corridor.",
      balanced:
        "Session two centered on the infiltration of the Lantern Archive. After careful preparation at the mill house, the party approached the sealed building under cover of the evening patrol rotation.\n\nNox took the lead, slipping under the scribe desk to mirror the ward sigils from below and disabling the first lattice without triggering the alarm chain. Ari covered the main corridor while Kael worked to suppress secondary wards using a controlled embersalt counter-agent he had prepared from the shrine residue.\n\nBehind the final ward barrier, the party discovered a concealed ledger chamber. The ledgers documented a financing pipeline connecting Ash Knife cells across three towns, with Moonwell Hollow serving as the distribution node for embersalt shipments that traveled along the Duskwater River. One ledger bore the seal of Voss Harken, a name the party had not encountered before but which Elder Tessara later confirmed as a disgraced former magistrate.\n\nThe party extracted the most critical ledger and retreated before the next patrol sweep, leaving the wards resealed to delay discovery of the breach.",
      detailed:
        "The Lantern Archive heist was the party's first coordinated tactical operation. Planning began at the mill house where Nox laid out the patrol schedule she had mapped during the previous session. The eastern approach offered the best entry window — eight minutes between sweeps, with a blind spot behind the archive's loading dock.\n\nEntry was smooth. Nox picked the loading dock lock in under thirty seconds and the party moved inside. The archive's interior was divided into three sections: a public reading room, a restricted records hall, and a sealed vault that Tessara had mentioned was warded after the disappearances.\n\nNox approached the ward lattice from underneath the scribe desk, using a polished metal tray to mirror the sigil arrangement so she could trace the deactivation sequence without direct contact. The first ward fell cleanly. The second required Kael's intervention — he applied the embersalt counter-agent to the connection points, dampening the magical resonance enough for Nox to trip the release.\n\nBehind the final barrier, the group found not a vault of rare texts but a concealed accounting chamber. Three ledger volumes sat on a stone shelf alongside a shipping manifest and a wax-sealed correspondence bundle. Ari photographed the manifest using her recording crystal while Kael catalogued the ledger entries.\n\nThe ledgers revealed a systematic financing operation. Embersalt was being refined somewhere upriver, shipped through the Duskwater trade corridor, and distributed to Ash Knife cells in Moonwell Hollow, Thornhaven, and the Pale Reach. Each shipment was annotated with a cipher that matched the note Ari had found at the watchtower.\n\nThe most significant discovery was the seal of Voss Harken on the oldest ledger. When the party later showed the seal to Elder Tessara, she identified Harken as a former magistrate who had been expelled from Moonwell Hollow years ago for corruption — but who apparently maintained a financial network that had been feeding the Ash Knife operation for longer than anyone realized.\n\nThe party resealed the wards to conceal the breach, took the key ledger and a copy of the manifest, and returned to the mill house to plan their next move — tracing the embersalt shipments upriver along the Duskwater.",
      generatedAt: "2026-03-05T20:34:00.000Z",
      modelVersion: "demo-seeded-v1",
    },
    recapReadiness: "ready",
    recapPhase: "complete",
    speakerAttribution: null,
    artifacts: { transcript: "available", recap: "available" },
    warnings: [],
  },
  "demo-s3": {
    id: "demo-s3",
    campaignSlug: DEMO_CAMPAIGN_SLUG,
    campaignName: "Demo Campaign",
    label: "Ashes on the Duskwater",
    title: "Ashes on the Duskwater",
    date: "2026-03-10",
    status: "completed",
    source: "live",
    sessionOrigin: "showtime",
    guildId: DEMO_GUILD_ID,
    isArchived: false,
    transcript: [],
    recap: {
      concise:
        "The party followed the Duskwater River to a hidden Ash Knife refining camp, rescued captive workers, and captured the alchemist Sable Greaves before destroying the embersalt production site.",
      balanced:
        "Session three took the party out of Moonwell Hollow and along the Duskwater River, following the trade route mapped in the archive ledgers. After a day of cautious travel, Ari identified signs of regular barge traffic at a concealed river inlet.\n\nThe inlet led to a hidden camp where Ash Knife operatives were refining raw embersalt in makeshift alchemical furnaces. A dozen captive workers from the nearby settlement of Thornhaven were being forced to process the material under guard.\n\nKael recognized the refining process and identified critical vulnerabilities in the furnace setup. The party devised a two-pronged approach: Nox would infiltrate the camp from the waterside to free the captives while Ari and Kael created a diversion at the furnace line.\n\nThe plan worked, though not without complications. Nox freed the workers but was spotted during extraction, triggering a camp-wide alarm. Ari's diversion detonated one of the furnaces prematurely, sending a column of acrid smoke skyward. In the chaos, the party captured Sable Greaves — the camp's lead alchemist and a direct subordinate of Voss Harken.\n\nGreaves, under pressure, confirmed that Harken was operating from a fortified estate somewhere beyond the Pale Reach and that a major embersalt shipment was scheduled to leave within the week. The party destroyed the remaining furnaces and escorted the captives back toward Moonwell Hollow.",
      detailed:
        "The Duskwater River expedition was the party's first extended field operation. They departed the mill house at dawn with supplies for three days, traveling light along the river trail that Nox had identified during her perimeter mapping.\n\nTravel was uneventful for the first half-day. The river ran wide and slow through mixed forest, with occasional clearings where old fishing camps had been abandoned. Ari noted that the trail showed signs of heavy use — deep ruts from wheeled carts, scuffed bark on trees where ropes had been tied, and occasional patches of disturbed soil where cargo had been staged.\n\nBy late afternoon, Ari spotted something unusual: a series of branch-woven screens partially concealing a narrow inlet on the river's eastern bank. Fresh barge tracks in the mud confirmed regular traffic. The party approached on foot and discovered a concealed camp roughly two hundred meters inland.\n\nThe camp consisted of six large tents, three makeshift alchemical furnaces built from salvaged stone, a storage shed, and a holding pen where approximately twelve workers from Thornhaven were being held under guard. The refining operation was running continuously — raw embersalt crystals were being heated, filtered, and packed into sealed transport casks.\n\nKael studied the furnace operation from a distance and identified two critical points: the filtration junction where unstable byproducts accumulated, and the primary fuel line that connected all three furnaces. Disrupting either would cascade through the system.\n\nThe party's plan had Nox approaching from the waterside to reach the holding pen while Ari and Kael positioned near the furnace line. On Nox's signal — three taps on her belt buckle transmitted through a paired resonance stone — Kael would destabilize the filtration junction while Ari covered the escape route.\n\nNox reached the holding pen without incident and began cutting the restraint ropes. She had freed eight of the twelve workers when a guard returning from a latrine break spotted her. The guard's shout triggered the alarm, but Nox had already passed the signal.\n\nKael's destabilization worked exactly as planned on the first furnace, but the cascading pressure wave hit the second furnace's fuel line before the guards could shut it down. The resulting detonation was larger than anticipated, sending a visible smoke column into the sky and scattering the remaining guards.\n\nIn the confusion, Ari crossed the camp perimeter and intercepted a figure fleeing toward the river — Sable Greaves, the camp's lead alchemist. Greaves was carrying a satchel of encoded shipping records and a sealed letter addressed to Voss Harken. Under the party's questioning, Greaves confirmed Harken's location beyond the Pale Reach, described the scope of the embersalt network, and revealed that a major consolidated shipment was being staged for departure within days.\n\nThe party destroyed the remaining furnaces, secured the shipping records, and led the freed captives back toward Moonwell Hollow. Elder Tessara would need to coordinate their safe return to Thornhaven while the party prepared for the final push toward the Pale Reach.",
      generatedAt: "2026-03-10T21:15:00.000Z",
      modelVersion: "demo-seeded-v1",
    },
    recapReadiness: "ready",
    recapPhase: "complete",
    speakerAttribution: null,
    artifacts: { transcript: "available", recap: "available" },
    warnings: [],
  },
  "demo-s4": {
    id: "demo-s4",
    campaignSlug: DEMO_CAMPAIGN_SLUG,
    campaignName: "Demo Campaign",
    label: "The Ember Tribunal",
    title: "The Ember Tribunal",
    date: "2026-03-15",
    status: "completed",
    source: "live",
    sessionOrigin: "showtime",
    guildId: DEMO_GUILD_ID,
    isArchived: false,
    transcript: [],
    recap: {
      concise:
        "The party confronted Voss Harken at his estate beyond the Pale Reach, secured evidence of the full Ash Knife network, and turned him over to the regional tribunal — ending the embersalt conspiracy but uncovering signs of a deeper threat.",
      balanced:
        "The final session of the arc brought the party beyond the Pale Reach to Voss Harken's fortified estate. Using the intelligence gathered from the archive ledgers and Sable Greaves's testimony, the group planned a direct approach — not a stealth infiltration, but a formal challenge backed by the evidence they had assembled.\n\nElder Tessara provided a writ of inquiry from the Moonwell Hollow council, giving the party legal standing to demand Harken's compliance. The party arrived at the estate gates with the writ, the ledgers, and Greaves's signed confession.\n\nHarken attempted to stall, first denying involvement and then offering to negotiate. When Nox revealed that she had already mapped his estate's escape routes during a pre-dawn reconnaissance, Harken's composure broke. He ordered his remaining Ash Knife guards to attack.\n\nThe fight was brief but intense. Kael used embersalt counter-agents to disable the estate's ward network, stripping Harken of his defensive advantage. Ari held the main corridor against six guards while Nox pursued Harken through a concealed passage to the estate's underground vault.\n\nIn the vault, the party found the full Ash Knife accounting — shipment records, operative rosters, and correspondence with contacts in cities far beyond the Duskwater region. Most troubling was a sealed letter bearing a sigil none of them recognized, addressed to Harken from someone identified only as the Pale Witness.\n\nHarken was taken into custody and transported to the regional tribunal at Thornhaven, along with the evidence. Elder Tessara formally thanked the party and confirmed that the Duskwater trade corridor would be placed under watch.\n\nThe campaign arc closed with the party gathered at the mill house, reviewing what they had accomplished — and what remained unanswered. The Ash Knife financing network was dismantled, the embersalt supply line was destroyed, and Harken would face justice. But the letter from the Pale Witness suggested that the conspiracy extended further than a single disgraced magistrate, and the disappearances along the Duskwater had never been fully explained.",
      detailed:
        "The ride to the Pale Reach took two days through increasingly desolate terrain. The forest thinned into scrubland and then rocky heath, with the Duskwater River narrowing to a cold, fast-moving stream. Ari navigated using landmarks from Greaves's description and the shipping manifest's route annotations.\n\nHarken's estate sat on a low rise overlooking the river's headwaters — a stone-walled compound with a central tower, two outbuildings, and a walled courtyard. It was larger and better maintained than the party had expected for a supposedly disgraced exile. Nox's pre-dawn reconnaissance identified twelve guards on rotation, three ward anchors embedded in the perimeter wall, and a concealed passage running from the tower basement to a river outlet.\n\nThe party chose a daylight approach. Arriving at the main gate with Elder Tessara's writ of inquiry, the archive ledgers, and Sable Greaves's signed confession, they demanded Harken present himself for questioning under the authority of the Moonwell Hollow council.\n\nHarken appeared on the courtyard balcony after a twenty-minute delay, dressed in magistrate's robes he no longer had the right to wear. He opened with denial — claiming the ledgers were forgeries, Greaves was a disgruntled former employee, and the party had no jurisdiction beyond Moonwell Hollow's borders.\n\nKael countered by presenting the embersalt samples, matching them chemically to the residue found at the Moonwell shrine and the refining output from the Duskwater camp. Ari produced the cipher note from the watchtower and demonstrated that it matched the encoding system used throughout Harken's correspondence.\n\nWhen Harken shifted to negotiation — offering information in exchange for immunity — Nox interrupted by describing his estate's escape routes in exact detail, including the underground passage to the river. She placed a marked stone from the passage entrance on the courtyard wall. Harken understood that retreat was not an option.\n\nHe ordered the attack. Six Ash Knife guards moved from concealed positions in the outbuildings while Harken retreated into the tower. Kael immediately targeted the ward anchors, applying concentrated counter-agent to the nearest stone. The anchor cracked and the eastern section of the perimeter ward collapsed, allowing Ari to take a flanking position.\n\nThe courtyard fight lasted roughly four minutes. Ari's archery pinned three guards behind a water trough while Kael advanced on the second ward anchor. Nox bypassed the courtyard entirely, entering the tower through a ground-floor window she had identified during reconnaissance.\n\nInside the tower, Nox found Harken descending a spiral staircase toward the underground passage. She cut him off at the vault level, where he had stopped to retrieve documents from a locked chest. The vault contained the full scope of the Ash Knife operation: ledgers covering five years of transactions, a roster of operatives across the Duskwater region, shipping schedules, and a bundle of sealed correspondence.\n\nThe most significant item was a letter bearing an unfamiliar sigil — a pale eye surrounded by radiating lines. The letter was addressed to Harken and signed only as the Pale Witness. Its contents referenced obligations, debts, and a timeline that suggested the embersalt network was one component of a larger operation that Harken himself did not fully understand.\n\nWith Harken subdued and the evidence secured, the party escorted him back through the Pale Reach to Thornhaven, where the regional tribunal convened an emergency session. Elder Tessara testified alongside the party, and the ledger evidence was entered into the record.\n\nThe arc concluded at the mill house in Moonwell Hollow. The embersalt refining operation was destroyed, the financing network was exposed, and Harken would stand trial. The Duskwater trade corridor was placed under council watch, and the freed workers from Thornhaven were safely returned.\n\nBut the letter from the Pale Witness sat on the table beside Nox's perimeter maps and Kael's alchemical notes. Whatever the Pale Witness represented, it was beyond anything the party had faced so far — and the disappearances along the Duskwater that had started this entire investigation remained unexplained.",
      generatedAt: "2026-03-15T22:05:00.000Z",
      modelVersion: "demo-seeded-v1",
    },
    recapReadiness: "ready",
    recapPhase: "complete",
    speakerAttribution: null,
    artifacts: { transcript: "available", recap: "available" },
    warnings: [],
  },
};

/* ──────────────────────────────────────── Demo Registry ── */

const DEMO_REGISTRY: RegistrySnapshotDto = {
  campaignSlug: DEMO_CAMPAIGN_SLUG,
  categories: {
    pcs: [
      {
        id: "demo-pc-ari",
        canonicalName: "Ari",
        aliases: ["Ari the Ranger"],
        notes: "The party's scout and tracker. Expert in field reconnaissance, trail reading, and ranged combat. Carries a recording crystal for evidence documentation.",
        category: "pcs",
        discordUserId: null,
      },
      {
        id: "demo-pc-nox",
        canonicalName: "Nox",
        aliases: [],
        notes: "Infiltration specialist and rogue. Skilled in lockpicking, ward bypass, and perimeter mapping. Uses paired resonance stones for silent communication.",
        category: "pcs",
        discordUserId: null,
      },
      {
        id: "demo-pc-kael",
        canonicalName: "Kael",
        aliases: [],
        notes: "Alchemist and ward specialist. Trained in embersalt counter-agents and chemical analysis. Provides the party's tactical approach to magical defenses.",
        category: "pcs",
        discordUserId: null,
      },
    ],
    npcs: [
      {
        id: "demo-npc-tessara",
        canonicalName: "Elder Tessara",
        aliases: ["Tessara"],
        notes: "Community leader of Moonwell Hollow. Provided archive access and council authority. Issued the writ of inquiry used to confront Voss Harken.",
        category: "npcs",
        discordUserId: null,
      },
      {
        id: "demo-npc-harken",
        canonicalName: "Voss Harken",
        aliases: ["Harken"],
        notes: "Disgraced former magistrate and mastermind of the Ash Knife embersalt network. Operated from a fortified estate beyond the Pale Reach. Captured and turned over to the regional tribunal.",
        category: "npcs",
        discordUserId: null,
      },
      {
        id: "demo-npc-greaves",
        canonicalName: "Sable Greaves",
        aliases: ["Greaves"],
        notes: "Lead alchemist at the Duskwater refining camp. Direct subordinate of Voss Harken. Captured during the camp raid and provided testimony against Harken.",
        category: "npcs",
        discordUserId: null,
      },
    ],
    locations: [
      {
        id: "demo-loc-moonwell",
        canonicalName: "Moonwell Hollow",
        aliases: ["the Hollow"],
        notes: "Small settlement along a cliffside trail. Home to Elder Tessara and the party's base of operations. Contains the Lantern Archive and a local shrine.",
        category: "locations",
        discordUserId: null,
      },
      {
        id: "demo-loc-archive",
        canonicalName: "Lantern Archive",
        aliases: ["the Archive"],
        notes: "A sealed records hall on the eastern edge of Moonwell Hollow. Contained a hidden ledger chamber documenting Ash Knife financing operations.",
        category: "locations",
        discordUserId: null,
      },
      {
        id: "demo-loc-duskwater",
        canonicalName: "Duskwater River",
        aliases: ["the Duskwater"],
        notes: "Major river and trade corridor. The Ash Knife embersalt shipments traveled along its length between Moonwell Hollow, Thornhaven, and the Pale Reach.",
        category: "locations",
        discordUserId: null,
      },
      {
        id: "demo-loc-pale-reach",
        canonicalName: "Pale Reach",
        aliases: ["the Pale Reach"],
        notes: "Desolate region beyond the Duskwater headwaters. Location of Voss Harken's fortified estate and the terminus of the embersalt supply chain.",
        category: "locations",
        discordUserId: null,
      },
      {
        id: "demo-loc-thornhaven",
        canonicalName: "Thornhaven",
        aliases: [],
        notes: "Nearby settlement whose workers were captured and forced into embersalt refining. Hosts the regional tribunal where Harken was tried.",
        category: "locations",
        discordUserId: null,
      },
    ],
    factions: [
      {
        id: "demo-fac-ashknives",
        canonicalName: "Ash Knives",
        aliases: ["the Ash Knives", "Ash Knife"],
        notes: "Criminal faction operating an embersalt production and distribution network across the Duskwater region. Funded by Voss Harken. Dismantled by the party over the course of four sessions.",
        category: "factions",
        discordUserId: null,
      },
    ],
    misc: [
      {
        id: "demo-misc-embersalt",
        canonicalName: "Embersalt",
        aliases: ["embersalt"],
        notes: "Controlled alchemical substance used by the Ash Knives to mark territory, suppress local ward magic, and generate funding. Refined from raw crystals at concealed riverside camps.",
        category: "misc",
        discordUserId: null,
      },
      {
        id: "demo-misc-palewitness",
        canonicalName: "Pale Witness",
        aliases: ["the Pale Witness"],
        notes: "Unknown figure referenced in a sealed letter found in Harken's vault. Sigil is a pale eye with radiating lines. Implies a larger conspiracy beyond the Ash Knife network.",
        category: "misc",
        discordUserId: null,
      },
    ],
  },
  ignoreTokens: [],
  pending: {
    generatedAt: null,
    sourceCampaignSlug: null,
    sourceGuildId: null,
    items: [],
    knownHits: [],
  },
};

/* ──────────────────────────────────────── Public API ── */

export function getDemoCampaignSummary(): CampaignSummary {
  return {
    slug: DEMO_CAMPAIGN_SLUG,
    guildId: DEMO_GUILD_ID,
    name: "Demo Campaign",
    guildName: "System Demo",
    guildIconUrl: null,
    description: "Guided sample archive with example sessions, recaps, and compendium entries.",
    sessionCount: DEMO_SESSIONS.length,
    archivedSessionCount: 0,
    lastSessionDate: DEMO_SESSIONS[DEMO_SESSIONS.length - 1]?.date ?? null,
    sessions: DEMO_SESSIONS,
    type: "system",
    editable: false,
    persisted: false,
    canWrite: false,
    readOnlyReason: "demo_mode",
  };
}

export function getDemoSessionDetail(sessionId: string): SessionDetail | null {
  return DEMO_SESSION_DETAILS[sessionId] ?? null;
}

export function isDemoSessionId(sessionId: string): boolean {
  return sessionId in DEMO_SESSION_DETAILS;
}

export function getDemoRegistrySnapshot(): RegistrySnapshotDto {
  return DEMO_REGISTRY;
}

export function getDemoCampaignForSky(): HomepageSkyCampaignSummary {
  return {
    id: `${DEMO_GUILD_ID}::${DEMO_CAMPAIGN_SLUG}`,
    slug: DEMO_CAMPAIGN_SLUG,
    name: "Demo Campaign",
    guildIconUrl: null,
    sessionCount: DEMO_SESSIONS.length,
    lastSessionDate: DEMO_SESSIONS[DEMO_SESSIONS.length - 1]?.date ?? null,
    sessions: DEMO_SESSIONS.map((s) => ({
      id: s.id,
      label: s.label,
      title: s.title,
      date: s.date,
    })),
  };
}
