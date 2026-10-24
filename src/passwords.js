/* vDocs: the same password checks and "Make one for me" as the vDocs app (for .vdoc files). */

/* vDocs: words for suggested passphrases (1066 short, everyday English words, about 10 bits each). */
const VD_WORDS = 'able acid acorn actor adapt adobe agent alarm album alert alien alley alpine amber amble ample anchor angel angle ankle apple april apron arbor arch arena argue armor arrow artist ash aspen atlas atom attic audio aunt autumn avenue award awake axis bacon badge bagel baker balmy bamboo banana band banjo barn barrel basil basin basket batch beach beacon beagle beam bean bear beaver bedrock beech beetle begin bell bench berry bird biscuit bison blade blanket blaze blend bliss block bloom blossom blue blush board boat bobcat bold bolt bonfire bonus boost boot border bottle boulder bounce bow bowl brain branch brass brave bread breeze brick bridge brief bright brisk broad bronze brook broom brush bubble bucket buckle budget buffalo bugle bundle bunny burrow butter button cabin cable cactus cake calm camel camera camp canal candle candy canoe canvas canyon cape caramel carbon cargo carpet carrot cart cash castle cattle cave cedar celery cellar cello chalk chamber chapel charm chart cheese cherry chess chest chimney chorus cider cinema circle citrus city clay clever cliff climb clock cloud clover coach coast cobalt cocoa coconut coffee coin comet comfort compass copper coral corn cotton couch country cousin cozy crab cradle craft crane crater crayon cream creek crisp crow crown crumb crystal cube cupcake curtain cushion cycle dagger daisy dance dawn deer delta denim desert desk dial diamond diary dinner dolphin donkey door dove dragon drama dream drift drum duck dune dusk eagle earth easel echo eclipse elbow elder elm ember emerald engine equal escape evening exact fable fabric falcon fancy farm feast feather fence fern ferry fiddle field fig finch fire flag flame flannel flash flask fleet flint float flock flood floor flour flower flute foam focus fog forest fork fossil fountain fox frame fresh frog frost fruit fudge gadget galaxy garden garlic gate gecko gem giant ginger glacier glade glass globe glove glow goat gold goose gorge grain granite grape grass gravel gravy green grove guitar gull habit hammer harbor harp harvest hatch hawk hazel heart hedge helmet herb heron hill hive hobby honey hoof horizon horse hotel hound house hunter husky iceberg igloo index ink inlet iris iron island ivory ivy jacket jade jaguar jam jar jasmine jelly jewel jigsaw jolly journey juice jungle juniper kayak kettle kernel key kingdom kite kitten kiwi knee knot koala ladder lagoon lake lamb lamp lantern laptop larch laser latch lava lawn leaf lemon lens lilac lily lime linen lion lobster locket lodge lotus lunar lute magnet mango maple marble market marsh mask meadow medal melon mesa metal meteor mint mirror mist mitten moat model molar monkey moon moose morning mosaic moss moth motor mountain mouse muffin mural museum music nature nectar needle nest nickel night noble noodle north nutmeg oak oasis oath ocean octave olive omelet onion opal orbit orchard orchid organ otter oven owl oyster paddle pagoda palace palm panda panel paper parade parcel parrot pasta pastel patch path peach peanut pearl pebble pecan pedal pelican pencil pepper piano pickle pigeon pillow pilot pine pink pirate pistol pixel pizza planet plaza plum pocket poem polar pond pony poppy porch potato pottery prairie prism pumpkin puppy puzzle quail quartz queen quest quilt rabbit radar radio radish raft rain raisin ranch raven razor reef ribbon rice ridge river robin rocket rose ruby saddle saffron sail salad salmon salt sand satin sauce scarf scout season seed shadow shark shell shelter shield ship shore silver singer siren sketch skate skull sled slope smoke snail snow soap socket sofa solar sonnet spark sparrow spice spider spiral splash sponge spoon spring sprout spruce squash squid stable stamp star statue steam steel stone storm story stove straw stream street sugar summer summit sunset swan sweater swift sword table tablet tango teacup temple tennis tent thistle thunder tiger timber toast tomato topaz torch tower trail train treasure tree trophy trout trumpet tulip tundra tunnel turkey turnip turtle twig umbrella unicorn valley vanilla velvet violet violin volcano voyage wagon walnut walrus wand water wave whale wheat wheel whistle willow window winter wizard wolf wool yacht yarn yellow yogurt zebra zenith zephyr zinc abbey acre adder aerial agate airship alder almond alpaca amulet anvil apricot aqua arcade ardent armchair aroma atrium avocado azure badger ballad balloon banner banquet barley baron barrow beret bistro bloke bluebell bobbin bonnet bookcase bramble breakfast brine brooch buggy bulb bumble buttress cabbage cadet caper capsule caravan cardigan carnival carousel cashew cask catapult cathedral cauldron cavern chariot cherub chestnut chili chipmunk chowder cinder citadel clam clarinet cobble cockle collar condor cookie cormorant cornet cottage cougar coyote cricket crocus croquet crumpet cuckoo cumin curry custard cutlass cymbal dahlia damson dandelion dazzle decoy dewdrop dimple dingo dinghy domino doodle dormouse doughnut dragonfly drizzle dumpling dynamo easter eggnog elk elixir emblem empire enamel envoy epic ermine espresso estuary fairway fallow fawn feline fennel ferret festival fiesta firefly fjord flamingo flapjack flicker florin flurry foghorn forge foxglove freckle frigate fritter frolic gable galleon gander gannet garnet gazebo gazelle geyser gherkin gingham giraffe glider goblet goblin gondola gooseberry gopher gourd granola greyhound griffin grizzly grotto gumdrop gusto halibut hamlet hammock hamster harmony hayloft hazard heather hedgehog helix hemlock hickory highland hilltop hippo holly hopscotch hornet hurdle hyacinth icicle iguana impala inkwell jackal jackdaw jamboree javelin jester jetty jockey jubilee jukebox kangaroo kelp kestrel kipper knapsack labrador lacquer ladle lark lasso laurel lavender leopard lettuce limerick lizard llama loaf locust loom lullaby lupin lynx macaw mackerel magpie mallard mammoth mandolin manor mantle marigold marlin marmot marten mascot meringue merlin midnight millet mimosa minnow minstrel mistletoe mocha mongoose monsoon moorland morsel muesli mulberry mushroom mustang mustard nautilus nettle newt nomad nougat nugget oatmeal ocelot okra omega oracle orange osprey ostrich ottoman paisley pancake panther papaya parsley parsnip partridge peacock peppermint periwinkle petal pheasant piccolo pinecone pinwheel pistachio plover plume poncho popcorn porcupine porpoise postcard pretzel primrose pudding puffin pyramid quarry quince quiver raccoon ragtime rambler rapids raspberry recipe reindeer relic rhubarb riddle rocker rooftop rosemary rowboat rucksack rustle sable sapphire sardine satchel scallop schooner scone seahorse seal sequoia sesame shamrock sherbet shingle shortbread shrimp signpost silo skylark sleigh snowdrop sorbet sorrel spaniel spinach squirrel starling stork strudel sundial sunflower swallow sycamore tadpole tamarind tapestry tartan teapot terrier thimble thrush thyme tinsel toffee tortoise toucan trellis trinket truffle tugboat turquoise tuxedo twilight vapor veranda vervain viper vista waffle wallaby warbler watercress weasel wigwam wildcat windmill wombat woodland wren yodel yonder zigzag zucchini'.split(' ');

const VD_COMMON = new Set(('password passw0rd letmein qwerty qwertyuiop asdfgh asdfghjkl zxcvbnm iloveyou welcome admin administrator login dragon monkey '
  + 'football baseball soccer master shadow sunshine princess trustno trustnoone superman batman spiderman starwars whatever freedom secret '
  + 'abc abcdef hello charlie donald michael jessica jordan ashley daniel thomas robert matthew andrew joshua liverpool arsenal chelsea united '
  + 'manchester london england yorkshire huddersfield leeds summer winter spring autumn flower computer internet google microsoft windows '
  + 'vdocs alabz aurora writer writing private diary journal secretdiary mypassword changeme default letmeinplease ilovemydog lovely mustang '
  + 'pokemon minecraft killer hunter ranger tigger soccer hockey golfer cookie cheese banana orange purple yellow silver golden').split(' '));
const VD_RUNS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'abcdefghijklmnopqrstuvwxyz', '01234567890', '09876543210'];
function vdStrength(pw) {
  if (!pw) return { score: 0, hint: '' };
  const low = pw.toLowerCase();
  const unleet = t => t.replace(/[0@4]/g, c => ({ 0: 'o', '@': 'a', 4: 'a' })[c]).replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[5$]/g, 's').replace(/7/g, 't');
  const wordSet = vdStrength.words || (vdStrength.words = new Set(typeof VD_WORDS !== 'undefined' ? VD_WORDS : []));
  const isWord = w => VD_COMMON.has(w) || wordSet.has(w);
  const hasCommon = t => [...VD_COMMON].some(c => c.length >= 6 && t.includes(c));
  // the word part, with numbers and symbols at the ends taken off (Huddersfield1! → huddersfield)
  const coreRaw = low.replace(/[^a-z@$0-9]*$/, '').replace(/\d+$/, '').replace(/[^a-z@$0-9]*$/, '').replace(/^[^a-z]+/, '');
  const coreL = unleet(coreRaw), core = coreL.replace(/[^a-z]/g, '');
  const tail = pw.length - coreRaw.length;
  if (VD_COMMON.has(low) || VD_COMMON.has(core) || /^\d+$/.test(pw)) return { score: 0, hint: 'That’s one of the first passwords anyone would try.' };
  if (/^(.)\1+$/.test(pw) || /^(.{1,3})\1{2,}$/.test(low)) return { score: 0, hint: 'Repeating the same thing is easy to guess.' };
  for (const r of VD_RUNS) for (let i = 0; i + 5 <= r.length; i++) if (low.includes(r.slice(i, i + 5)) && low.length < 16) return { score: 0, hint: 'Keyboard runs like “qwerty” or “12345” are easy to guess.' };
  if (hasCommon(core) && core.length < 16) return { score: 1, hint: 'It’s built on a very common password.' };
  const single = !/[\s\-_.,+]/.test(pw.trim()) && /^[a-z]+$/.test(coreL) && core.length >= 3;
  if (single && tail <= 6 && core.length <= 13) return { score: 1, hint: tail ? 'A word with numbers or symbols added is easy to guess.' : 'A single word is easy to guess.' };
  // a passphrase: several words with spaces or dashes (about 12 bits a word)
  const parts = low.split(/[\s\-_.,+]+/).filter(Boolean);
  let bits;
  const wordy = parts.filter(p => /^[a-z]{2,}$/.test(p));
  if (parts.length >= 3 && wordy.length >= 3 && parts.every(p => /^[a-z]+\d{0,4}$|^\d{1,4}$/.test(p))) {
    bits = new Set(wordy).size * 12 + (/\d/.test(pw) ? 6 : 0) + (/[A-Z]/.test(pw) ? 2 : 0);
    if (wordy.every(p => VD_COMMON.has(p))) bits = Math.min(bits, 30);
  } else {
    let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26; if (/[A-Z]/.test(pw)) pool += 26; if (/\d/.test(pw)) pool += 10; if (/[^A-Za-z0-9]/.test(pw)) pool += 30;
    bits = pw.length * Math.log2(Math.max(pool, 1));
    if (/(19|20)\d\d/.test(pw)) bits -= 8;                       // years are guessed early
    if (single) bits = Math.min(bits, 44);
  }
  const score = bits < 36 ? 0 : bits < 45 ? 1 : bits < 60 ? 2 : bits < 75 ? 3 : 4;
  const hint = ['Too easy to guess.', 'A little weak: make it longer, or use a few random words.', 'Good.', 'Strong.', 'Very strong.'][score];
  return { score, hint, bits: Math.round(bits) };
}
// what's wrong with a new password, or null if it's fine (used everywhere you set one)
function vdPasswordProblem(pw) {
  if (!pw || pw.length < 10) return 'Use at least 10 characters.';
  const s = vdStrength(pw);
  if (s.score >= 2) return null;
  return s.hint.replace(/: make it longer, or use a few random words\.$/, '.') + ' Try a few random words, or press “Make one for me”.';
}
// a passphrase like "otter-maple-lantern-cobalt-7-meadow": five random words and a number (about 56 bits)
function vdPassphrase() {
  const n = VD_WORDS.length, pick = () => { const r = new Uint32Array(1); let x; do { crypto.getRandomValues(r); x = r[0]; } while (x >= Math.floor(2 ** 32 / n) * n); return VD_WORDS[x % n]; };
  const w = [pick(), pick(), pick(), pick(), pick()];
  const r = new Uint32Array(2); crypto.getRandomValues(r);
  w.splice(r[0] % 6, 0, String(10 + (r[1] % 90)));
  return w.join('-');
}
