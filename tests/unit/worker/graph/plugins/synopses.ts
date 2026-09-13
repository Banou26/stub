/**
 * The three measured Mushoku Tensei seasons, as `EpisodeProfile.synopsisKeys` rows.
 *
 * WHAT THIS IS. `ours` is TMDB's episode overviews for TMDB show 94664 seasons 1, 2 and 3; `theirs`
 * is the `contextualSynopsis` Netflix's own graphql returns for seasons 81392609, 81705182 and
 * 82941638. Both sides are already reduced by `synopsisKeyOf` (`plugin:profile`), which is the shape
 * that reaches `plugin:range`: a sorted bag of content words, four letters or longer, stopwords
 * dropped. Recorded 2026-09-13.
 *
 * REDUCED AND NOT RAW, for two reasons. It is the column the rule reads, so a case built on it is
 * built on what arrives rather than on a second reading of the same text; and it is half the bytes,
 * which matters at 61 paragraphs. The reduction itself is proven separately, from raw text, in
 * `profile.test.ts`, so nothing here is asked to stand for it.
 *
 * THE ROWS ARE IN NUMBER ORDER, index 0 being episode 1 of that side, and a row is EMPTY where the
 * source's synopsis says nothing: Netflix season 3 episode 12 (index 11) is a single space, which is
 * the one row `MIN_SYNOPSIS_KEY_TOKENS` refuses here.
 *
 * TMDB numbers 23, 24 and 14 episodes against Netflix's 24, 25 and 12, which is why the truth
 * offsets are 0, -1 and 0 rather than a single shift: season 2 opens with a special Netflix numbers
 * as episode 1, and TMDB's season 3 list runs two episodes past the Netflix season.
 */
export const MUSHOKU_SYNOPSES = {
  /** SEASON 1, truth offset 0 */
  s1: {
    ours: [
      '34yearold baby beginners chance fantasy life lifetime loving magic make newborn parents recluse regrets second sets textbook truck unemployed wakes world',
      'afraid already begins chance doomed failure father learning leave life magic makes memories outside past progress rapid rudy second swordsmanship training traumatic tutor',
      'begins bullies child close explore friend greenhaired group grow magic practicing rescues rudy rudys thinks village',
      'announces child dour family father greyrat happy lilia mood overjoyed paul pregnant reveals rudys second shes takes turn zenith',
      'alone arrives bargained city daughter ever fight first five hell however keep local lord next rudy spend start student supposed tutoring years',
      'anything causing city doesnt eriss interested learn lessons magic nonstop officially other proposes realizes rudy stress struggles subjects tutor want',
      '10th across approaching birthday cant celebrate dance eris eriss fast grandfather invited kingdom lessons losing nobles party patience problem quickly shes theres',
      '10th across begin birthday city entities eris family hovering meanwhile mystery note party plan powerful reaches remains rudy strange surprise take world',
      'chance continent demon demons eris find infamous rudy ruijerd seems stranded superd survive themselves tribe trusted warrior wilds',
      'adventurers allowed arent city decide earn eris hold inside journey like make money need plan practice register rudeus ruijerd superd well',
      'dead doesnt down head hope less moneymaking monster mysterious place plans rudys safe scheme smoothly thought track turn unfortunately',
      'another around continent dead demon discovers fees find fortune leave receives roadblock rudeus ruijerd struggle unexpected vision',
      'across arrives begin continent deal demon family meanwhile missing ocean pauls roxy rudeus ruijerd search smugglers strikes transport',
      'arrive beast clear doldia eris fight finds freedom himself imprisoned loses name patience people rudeus ruijerd tries village',
      'befriends chieftains conflict dead decide doldia eris fondness ghislaine granddaughter leads rainy season unexpected village wait',
      'alley arrive chance country encounter eris holy home leads millis reunion rudeus rudeuss ruijerd shocking split thoughts three turn',
      'actions aftermath disastrous forward look paul reflect reunion rudeus',
      'arrives back board central continent encounters eris faces familiar meanwhile millishion rikarisu roxy rudeus ruijerd setting ship',
      'anxious arrives bargained central continent dead finally kingdom mangod means reunion roxy rudeus shirone unexpected vision',
      'able appears desperate despotic dungeon hopeless imprisoned magicproof prince request rudeus seems straits strange talk unexpected visitor',
      'adventures chance encounter eris journey mountain nearing pass premature rudeus ruijerd snowy threatens',
      'bittersweet eris finally fittoa goodbyes homecoming make news return rudeus sudden unpleasant',
      'back continue departure depression eriss feet following journeys many people rudeus sinks struggles',
    ],
    theirs: [
      'awakes child discovers fades reborn sorcery sword truck unconsciousness world',
      'continues country life magic memories painful previous ranoa recalls roxy rudeus school study tells',
      'angry bullies child father friend greenhaired home makes outside play returns rudeus saves venturing',
      'addition announcement discord family greyrat happy news overshadowed quickly rudeus similar smooth tries',
      'arrives attitude awry change city devises girl goes meets obstinate plan rudeus soon tutor young',
      'begins enthusiasm eris focusing ghislaine goes help magic other rudeus shows subjects teaching though trouble',
      '10th ahead birthday cant dance eris foreign free languages learn lessons party rudeus seem steps studies takes time',
      'birthday eris extravagant family gift gives greyrat holds makes night offer party philip rudeuss surprise unexpected',
      'awakes being conversing divine dream find himself intimidating land rudeus spear strange wielding',
      'adventurers arrive become bustling city decide eris guild join mockery quickly rudeus ruijerd target',
      'arrives finds fittoa forest investigate monster notice party paul petrified region reports roxy rudeus',
      'advice afford dream exorbitant ferry figure gives mangod night party rudeus',
      'dead eris goes hears hideout infamous retrieve rough roxy rudeus ruijerd rumors smugglers voyage',
      'beast befriends cellmate children forest geese group imprisoned kidnap people rudeus sacks smugglers village',
      'angry becomes doldia enjoying eris generosity ghislaine gyes mention name recall rudeus same tribe tribes',
      'arriving being captors child city dead decides earning follows kidnapped millishion money rudeus spend spots time',
      'amends angry drowns following geeses goes heart make paul reunion rudeus sorrows taking words',
      'boat central continent decides eris home make parents reluctantly roxy rudeus ruijerd village visit',
      'aisha arriving central continent cryptic last lilia long looks place rudeus searches sister vision',
      'eris families figure imprisoned made palace prince questions rescue rudeus ruijerd shirone soldiers third',
      'along encounters eris group know mountain nothing path perilous plenty rudeus rudeuss ruijerd seems terrifying',
      'become camp devastated eris finally find friend home nearby reaches refugee rudeus wasteland',
      'abandoned affected continue eris feeling journeys life past relapses respective rudeus ruijerd selfisolation',
      'accompany allows arrogant encounters eris goblins heads mage millishion quest reluctantly slay young',
    ],
  },
  /** SEASON 2, truth offset -1 */
  s2: {
    ours: [
      'back deep easy eris feet getting harsh himself journeys least lost mother northlands parting rudeus scars search tells thats',
      'adventurer arrow closer counter danger doesnt finds friends grows head himself life northlands party rears risking rudeus settles still want',
      'asks behind date decides done easier forget heartbreak looking past putting romance rudeus said sara seem start things',
      'adventuring arrival closer curing direction finding impotence life mother offer rudeus seductive send soldat sudden unexpected whole years',
      'advice does enemies enigmatic enrolls find fitz following friend future hold mangods meets potential reunites rudeus school seeks silent',
      'acquainted better drastic efforts enigmatic fitz friend growing life proposes roadblock rudeus school settling silent solution teach zanoba',
      'able destroyed discovers easy fight figures figuring next precious revenge rudeus schoolgirls schoolmates swears trounce wont',
      'awkward beast classmate dreams fight first girl hell help love mating meet peoples positionone puts rudeus rudeuss season seeks smitten',
      'brilliant calls classmate didnt doesnt elusive expectand face familiar finds investigating laboratory leads mass rudeus seek sevenstar silent silents teleportation tower welcome',
      'classmate does enigmatic feel find fitz friends increasingly passes really routine rudeus secrets settles silent thoughts time university',
      'ariel choice confronts determined expedition forest forever herself invites last memory push reveal rudeus rudeuss sylphiette ties',
      'admits ails cure enough even feelings hearttoheart herself isnt problem reveals rudeus sets sylphiette',
      'brimming confidence cured friends haunted house idea mansion marriage marry needs newly newlywed problem resolves rudeus sylphie tell winds works world',
      'crowd custom dictates easy even everyone home host know newlyweds next party preparing pull settled store surprises throw wont',
      'aisha continues explains join letter magic meanwhile nanahoshi norn original paul receives research return rudeus rudeuss sent sisters summoning world younger',
      'aisha arrive bargained catching chaperone convincing decides friend girls norn rudeus rudeuss school send sisters time trouble turns unexpected',
      'attend cause classes discover dorm haunted herself life norn past problems refuses room rudeus sets shuts sisters solve specter',
      'announcement family friends idyllic letter life looking plenty rudeus school settling sisters sylphie time unexpected until upend',
      'begaritt birth denizens desert elinalise first gains gives harsh help hope hurry journey monstrous nanahoshis need obstacle return rudeus shorten still sylphie',
      'claimed deadly elinalise faint fruits hope labyrinth last learn mentor mother offer paul rapan reach reunite roxy rudeus rudeuss soon studies time zenith',
      'amid around awkward does earnest labyrinth little mentor perils reconnects rescue resumes roxys rudeus search seem zenith',
      'bitten chew confronts guardian heart labyrinth magic monster party reaches realize rescue rudeuss shrugs teleporter',
      'consequences depression desperate face feelings group home journeys makes move must negotiate pull roxy rudeus',
      'absence arrives become conversations death disasters family frantic gone home introduce pauls reeling right rudeus something still waiting wife wrong',
    ],
    theirs: [
      'ariel asura attacked falls inadvertently kingdom monster mysterious princess rescues whitehaired',
      'accompany adventurers encounters invite lands later mother northern quest rudeus search',
      'arrow brash counter large lizardlike monsters number party rival rudeus saved struggle swordsman',
      'dagger date embarrassing faces great invites problem rudeus sara shop time together until',
      'city crew elinalise encounters fathers former gives good members news party pipin rudeus soldats staying',
      'arrive asks duel elinalise magic ranoa rudeus student teacher test trial university whitehaired',
      'begs closer comfortable figurines fitz growing later make routine rudeus school settles starts teach zanoba',
      'back decides figurine learns linia made pieces pursena roxy rudeus schoolmates shock smashed',
      'appears asks campus challenges cliff demon duel elinalise introduce later lovestruck musclebound rudeus',
      'accomplished causes goes highly hoping learn magic meet panic rudeus sight student summoning',
      'become begins close dejected feel fitz hasnt meanwhile much nanahoshi realizes rudeus spending time',
      'advice ariel concerned discovery distance fitz following gives keep rudeus stern struggles words',
      'ailment ariel cure decide finally find gives having help luke report reunited rudeus rudeuss sylphie vexing',
      'advice asks cliff customs dark first history house marriage recommend rudeus together visit zanoba',
      'elinalise emotional host house later party prepare reaction reception rudeus sylphie unexpected wedding',
      'aisha asking breakdown care fails later letter magic nanahoshi norn paul receives rudeus summoning take',
      'attempts enrolling fluster follow instructions letter paul reactions rudeus school sisters suggests',
      'answers become classroom demands determined help learning life norn previous reminded rudeus shutin storms',
      'advice distressing gets happy hearing letter mangod mother news receives rudeus search sylphie',
      'city consults decision elinalise gives having labyrinth later made nanahoshi rapan rudeus something tough unexpected',
      'begin discuss elinalise labyrinth meet party paul present rapan realizes roxy rudeus weary',
      'back bring delighted labyrinth later party recover reenter renewed reunite roxy rudeus town vigor',
      'companions final finally floor hydra immensely labyrinth locate powerful reaching rudeus stands zenith',
      'attempts back becomes begin comfort companions despair heading home later overwhelmed regret roxy rudeus',
      'everything family happened home including intention months returning roxy rudeus second take tells wife',
    ],
  },
  /** SEASON 3, truth offset 0 */
  s3: {
    ours: [
      'angers attitude brash disciples eris eriss ghislaine other sword takes train under',
      'continues discoveries eris masters nina other rival sparks styles training',
      'approve friends life marriage roxy rudeus second starts sylphiette',
      'begs fearful form losing loved magic ones potent roxy rudeus teach',
      'attends birthday cliff elinalises goes presents rudeus shopping sisters wedding',
      'accompanies bodyguard face mission past roxy rudeus runs unexpected',
      'experiment following nanahoshi offers reward rudeus successful summoning',
      'audience condition cure find hero hoping mothers perugius rudeus seeks',
      'ancient contracts disease find help hope lose nanahoshi races rudeus seeing',
      'along captured demon friends guards king kishirika locate rudeus warlike',
      'appears dreams message puzzling receives rudeus strange visitor',
      'adding database dont english expand help overview translated',
      'adding database dont english expand help overview translated',
      'adding database dont english expand help overview translated',
    ],
    theirs: [
      'alongside eris farion fellow ghislaine goes holy land leaving nina rudeus saint sword swords trains under',
      'arrive disciple eris grounds hearing investigates isolde later nina reida rudeus skeptical talk training water',
      'admit begins brings forcing happy home magic ranoa roxy rudeus second teaching university wife',
      'acquires anybody cliff continues determined else hand help lose magic prosthetic researching rudeus zanoba',
      'aishas birthday celebrate cliff elinalise forgotten heads norn present realizes rudeus shopping wedding',
      'accompanies acquaintance adventurers among escorting meets party princess protecting roxy rudeus tasked',
      'assistance chapter experiment graduating lives move nanahoshi next rudeus says students thank wants',
      'armored audience breaker chaos dragon floating fortress gains king legendary lives nanahoshi perugius rudeus',
      'collapsed disease earlier eradicated know millennia nanahoshi rudeus search sets someone thought',
      'continent cure demon down dryne guards kings kishirika party rudeus seeking syndrome taken track',
      'advice atoferatofes brings escaping figure herb hitogamis home hopes mysterious nanahoshi obtains pursuit rudeus save',
      '',
    ],
  },
} as const
