# Recipe audit verification

## Stage 3: Drained weights, chowder fat, and chicken yield

Research date: October 23, 2026. The Stage 3 observations describe the recipe state before the qualification edits listed below. Research didn't establish replacement numeric values. Existing ingredient amounts and nutrition macros were preserved.

**Result:** None of the three recipe-specific drained weights is verified. Nana's stated fat is inconsistent with the listed butter amount under an ordinary-butter assumption. Gochujang chicken's edible yield doesn't reconcile with its stated bone and cooking losses. The sources below support those distinctions, not replacement recipe numbers.

### Evidence limits

- The original canned-food brands and labels are unknown. USDA reference yields aren't measurements of these recipes' products. A different manufacturer's label wouldn't establish product identity either.
- The supplied archive review found no portion measurement for gochujang chicken. The other food photos don't establish quantities. This report doesn't independently recheck those archives.
- The ounce-to-gram conversions were already confirmed. They describe total labeled contents before draining, not food left after discarding packing liquid. Calculations below use 28.349523125 g per ounce.
- All cited public sources were accessible. PDF excerpts were read directly from USDA documents with the already-installed `pdftotext`; no packages, paid APIs, credentials, or original recipe URLs were used.

### Mom's Potato Salad: Drained potato weight remains unknown

**Current file:** `salads/moms-potato-salad.html:62` lists four 15 oz cans of sliced potatoes, drained, with approximately 1,700 g. Line 126 explicitly drains the potatoes before heating and again afterward. Lines 166–170 give batch and portion weights based on an unverified ingredient-weight basis.

**Verified facts:** Four 15 oz cans convert to 1,700.97 g of total labeled contents. That arithmetic matches the displayed estimate but doesn't establish drained potato mass. USDA's sliced-potato reference distinguishes a 14½ oz purchased can from approximately 9.9 oz of drained, unheated potatoes [S2, printed page 2-34].

**Assumptions and unknowns:** The recipe calls for 15 oz cans, not USDA's 14½ oz reference pack. The brand, packing liquid, actual drained weight, and weight after the second drain remain unknown. The numeric match suggests a net-contents conversion, but doesn't prove how the estimate was created. No USDA ratio was applied to the recipe.

**Recommended minimal treatment:** Keep the four-can quantity and draining directions. Flag the gram equivalent as unverified rather than substituting a guessed drained weight. If a recipe correction is approved, remove or qualify the unsupported equivalent and affected batch/portion estimates until an identified label or measured batch establishes the basis. Don't treat the existing fresh-potato 1:1-by-weight substitutions at lines 65 and 69 as verified numeric replacements.

### Mom's Chili: Drained kidney-bean weight remains unknown

**Current file:** `soups-and-stews/moms-chili.html:61` lists one 28 oz can of kidney beans, drained, with approximately 790 g. Line 122 uses drained beans; line 134 also recommends rinsing. Lines 152 and 158–162 contain nutrition and weight estimates whose bean-weight basis isn't documented.

**Verified facts:** A 28 oz can converts to 793.79 g of total labeled contents. That doesn't establish approximately 790 g of drained beans. USDA's kidney-bean reference lists a 15½ oz purchased can yielding approximately 10.0 oz drained and unheated, or 9.5 oz heated and drained [S2, printed page 2-7]. These are reference yields, not this recipe's product.

**Assumptions and unknowns:** The recipe's 28 oz brand, bean variety, drained/rinsed yield, and nutrition calculation inputs remain unknown. The cited reference sizes don't identify its product. No ratio was extrapolated to 28 oz.

**Recommended minimal treatment:** Keep the 28 oz can and draining instructions. Flag approximately 790 g as an unsupported drained equivalent. Any approved correction should qualify or omit that equivalent and flag dependent estimates rather than invent a new bean weight or recalculate macros from an unidentified product.

### Nana's Fish Chowder: Drained potato weight remains unknown

**Current file:** `soups-and-stews/nanas-fish-chowder.html:85` lists two 15 oz cans of diced potatoes with approximately 850 g drained. Line 128 uses drained potatoes. Line 161 explicitly assumes 850 g canned potatoes in the nutrition estimate; lines 167–171 give batch and portion weights.

**Verified facts:** Two 15 oz cans convert to 850.49 g of total labeled contents. That doesn't verify 850 g drained. USDA's diced-potato reference lists a 102 oz purchased can yielding approximately 73.7 oz drained, unheated potatoes [S2, printed page 2-34]. It confirms that purchased and drained weights are different bases, not a yield for Nana's two cans.

**Assumptions and unknowns:** No original 15 oz diced-potato label or measured drained yield was identified. The institutional USDA pack isn't the recipe's product, and its yield wasn't scaled down. The actual potato contribution to nutrition and finished weight remains unresolved.

**Recommended minimal treatment:** Keep the two-can quantity and draining directions. Flag or, with approval, omit the unsupported drained gram equivalent. Don't publish a replacement potato mass, nutrition panel, or batch weight from the reference yield alone.

### Nana's Fish Chowder: Fat inconsistency is conditional but supported

**Current file:** `soups-and-stews/nanas-fish-chowder.html:73` specifies one cup of butter, approximately 225 g. Lines 127 and 131 add both halves to the soup, with no butter-discard step. Line 152 reports 42 g fat per serving. Line 161 explicitly bases the nutrition estimate on 225 g butter and four servings, plus cod and whole milk.

**Verified reference facts:** USDA describes butter as containing at least 80% milkfat by weight [S3]. Land O Lakes Salted Butter independently labels a 14 g tablespoon with 11 g total fat [S4]. Neither source identifies Nana's butter brand or its exact composition.

**Conditional calculation:** If the listed 225 g is ordinary butter meeting USDA's definition and all of it remains in four servings, butter alone contributes at least `225 × 0.80 ÷ 4 = 45 g` fat per serving. That's already above the panel's 42 g before milk and fish. Using the manufacturer's rounded label ratio instead gives approximately `225 × 11 ÷ 14 ÷ 4 = 44.2 g`. That second calculation is illustrative, not exact composition or a recipe-specific value. The rounded manufacturer ratio mustn't replace USDA's minimum-fat definition.

**Assumptions and unknowns:** The argument assumes ordinary butter, the listed mass, four servings, and retention of the added butter. The exact butter product, actual quantities, fat left in the pot, and original nutrient calculation remain unknown. A reduced-fat spread wouldn't be the same reference food. The evidence doesn't establish a corrected whole-recipe fat or calorie value.

**Recommended minimal treatment:** Flag the 42 g panel as inconsistent with its stated ingredient assumptions. Preserve the ingredient quantity pending source confirmation. Recalculate nutrition only after the ingredient identities, drained potato mass, serving count, and calculation basis are established. Don't change butter quantity to force agreement with the existing panel.

### Gochujang Chicken: Yield explanation fails its own mass balance

**Current file:** `main-dishes/gochujang-chicken.html:61–76` lists 1,040 g bone-in, skin-on thighs and 67 g other ingredients. Lines 115–119 report 1,107 g uncooked, 780 g cooked, and 195 g per serving. The explanation claims approximately 28% moisture loss and exclusion of bones at approximately 30% of raw thigh weight.

**Verified arithmetic:** The listed ingredients sum to 1,107 g. Under the page's own 30% bone assumption, bones account for `1,040 × 0.30 = 312 g`. Even retaining every gram of glaze, the edible amount before cooking loss would be `1,107 − 312 = 795 g`. A 780 g edible result then leaves only 15 g of cooking/handling loss. It doesn't reconcile with a separate 28% cooking loss on the remaining chicken.

For illustration only, applying 28% loss to the bone-free chicken and retaining all 67 g of other ingredients gives `(1,040 × 0.70 × 0.72) + 67 = 591.16 g`. This isn't a replacement yield. It shows why the stated assumptions don't produce 780 g. Applying 28% to the whole raw batch without subtracting bones gives 797.04 g, numerically close to 780 g; that resemblance doesn't prove the original calculation.

**Verified reference fact:** USDA separately labels a bone-in, skin-on thigh yield as cooked, boned meat with skin, with `1 lb AP = 0.52 lb cooked, boned, chicken meat with skin` [S5, printed page 1-32]. This supports keeping as-purchased and edible cooked bases distinct. It doesn't validate the page's 30% bone fraction, 28% moisture claim, or air-fryer-specific yield. Cooking loss can include rendered fat and juices, not only moisture; the page provides no measurement separating those components.

**Assumptions and unknowns:** Actual raw thigh mass, bone fraction, cooked edible meat/skin mass, glaze retention, and cooking losses remain unmeasured. The USDA reference isn't a test of these four thighs or this air-fryer method. No reference yield was applied as the recipe's yield.

**Recommended minimal treatment:** Flag the cooked/portion estimates and contradictory explanation together. If approved, qualify or omit the unsupported edible-yield claims rather than change one percentage or call 780 g a verified bone-in weight. A measured raw batch, cooked bone-in batch, removed bones, and edible meat/skin/glaze would establish a consistent basis. Don't substitute 591 g or a USDA-derived number as a production correction.

### Sources and short excerpts

All sources were accessed October 23, 2026. Printed page identifiers below refer to document footers, not PDF viewer page numbers.

**[S1] USDA Food Buying Guide, About, “Yields.”**

URL: https://foodbuyingguide.fns.usda.gov/Home/About

> “The yield information provided in this guide represents average yields based on research conducted by USDA.”

Use: USDA's yields are planning references. They aren't measurements of an unidentified brand or recipe batch.

**[S2] USDA Food Buying Guide, Section 2, Vegetables.**

URL: https://foodbuyingguide.fns.usda.gov/files/Reports/USDA_FBG_Section2_Vegetables_YieldTable.pdf

- Printed page 2-34, sliced potatoes, No. 300 can (14½ oz): “about 9.9 oz ... drained, unheated potatoes.”
- Printed page 2-34, diced potatoes, No. 10 can (102 oz): “about 73.7 oz ... drained, unheated potatoes.”
- Printed page 2-7, canned kidney beans, No. 300 can (15½ oz): “about 10.0 oz ... drained, unheated beans”; the heated/drained row gives “about 9.5 oz.”

The ellipses omit cup equivalents only. Can sizes come from the same rows' purchase-unit columns. Use: evidence that a purchased can's net contents and its drained solids are separate quantities. These aren't recipe-specific replacement weights [S1].

**[S3] USDA Agricultural Marketing Service, Butter Grading Information.**

URL: https://www.ams.usda.gov/grades-standards/butter-grades-and-standards/butter-grading-info

> “containing not less than 80 percent by weight of milkfat.”

Use: a conditional ordinary-butter minimum, not an assay of Nana's source product.

**[S4] Land O Lakes, Salted Butter, manufacturer nutrition label.**

URL: https://www.landolakes.com/products/butter/salted-butter/

> “1 Tbsp (14g)”
>
> “Total Fat 11 g”

Use: an accessible manufacturer example supporting the conditional fat inconsistency. Label values are rounded. This isn't evidence that Nana used this brand.

**[S5] USDA Food Buying Guide, Section 1, Meats/Meat Alternates.**

URL: https://foodbuyingguide.fns.usda.gov/files/Reports/USDA_FBG_Section1_MeatsAndMeatAlternatesYieldTable.pdf

Printed page 1-32, chicken thighs with bone and skin:

> “1 lb AP = 0.52 lb cooked, boned, chicken meat with skin”

Use: clear separation between purchased bone-in mass and edible cooked mass. Not a measured air-fryer yield or support for the recipe's individual loss percentages [S1].

### Review gate

Stage 3 establishes reference facts and arithmetic conflicts, not completed verification of drained weights, full nutrition, or cooked yield. No replacement numeric values are justified by these sources alone. Stage 3 was reviewed before the Stage 4 source comparison started.

## Stage 4: Ten linked originals compared with current HTML

Research date: October 23, 2026. Stage 3 was reviewed and Phase 4 authorized before these requests. Only this report was edited. Comparisons include the existing Phase 1/2 local corrections, not an earlier checkout.

**Access and evidence:** Nine originals were accessible. Mapo Tofu returned HTTP 403 on the initial public request and one retry through the public fetch tool. No further attempt, login, or bypass was made. Each successful URL was fetched once during the comparison; the main session separately retrieved Pad Thai to corroborate its water and dried-shrimp differences. Quotes below come from the original's decoded recipe structured data unless identified as visible text. Source recipe fields were compared by name, not by nutrition display order. No swapped protein/fat/carbohydrate labels were found in the nine comparable current files; Mapo's source couldn't be checked.

These are current-source differences, not proven historical extraction losses. A source's publication or modification date doesn't establish what an earlier extraction received. No historical source snapshot was used. Generated local gram conversions and cooked/portion estimates aren't source-provided just because the underlying ingredient or serving count matches. The fetched recipe records didn't corroborate measured cooked batch weights for these ten recipes.

**Stage 3 access qualification:** Its “all cited public sources were accessible” statement describes that research session, not universal access. The main session reports HTTP 403 for USDA AMS butter information [S3], while independently accessing USDA About [S1] and the manufacturer label [S4]. Access can vary by client or session. This doesn't turn an inaccessible page into independently verified evidence for that client.

### 1. Blueberry Muffins: Metric sugar discrepancy, otherwise close

Original URL: https://preppykitchen.com/blueberry-muffins-with-sour-cream/

- **Original facts:** “12 muffins”; prep 10 minutes, cook 20, total 30. The current card lists whole milk, not sour cream despite the URL. It specifies “¾ cup granulated sugar ((170g))”, “2 cups all-purpose flour ((240g))”, and “¾ cup whole milk ... (180ml)”. Nutrition is 226 kcal, protein 4 g, fat 9 g, carbohydrate 32 g for “1 serving”.
- **Current HTML:** `breakfast/blueberry-muffins.html:48–52` matches time and yield. Ingredient amounts at `breakfast/blueberry-muffins.html:59–93` match the source's volume/count amounts, but sugar is 150 g at line 70, not the source's 170 g. Milk is a local 183 g conversion, not the source's 180 ml. Preparation at `breakfast/blueberry-muffins.html:100–107` follows the source's 400°F, full muffin cups, and approximately 20-minute bake. Nutrition at `breakfast/blueberry-muffins.html:124–133` matches the current source's named macros. The batch weights at `breakfast/blueberry-muffins.html:139–143` aren't verified source measurements.
- **Treatment:** Owner/source clarification for which sugar basis to preserve. Don't silently replace 150 g with 170 g or call either a proven historical reading error. Retain the matched recipe and nutrition fields; no re-extraction is needed to identify this single-field difference.

### 2. Buttermilk Pancakes: Retain the corrected local version

Original URL: https://www.greatgrubdelicioustreats.com/the-best-buttermilk-pancakes-recipe/

- **Original facts:** “12 pancakes”; prep 10, cook 10, total 25 minutes. Ingredients include “⅛ cup sugar”, “2 cups buttermilk”, “1 teaspoon vegetable oil”, and butter/maple syrup as desired. Directions use the oil on the griddle, rest batter 5–10 minutes, and portion ¼ cup per pancake. Nutrition explicitly says “1 pancake”: 123 kcal, protein 4 g, fat 3 g, carbohydrate 20 g.
- **Current HTML:** `breakfast/buttermilk-pancakes.html:48–53`, `breakfast/buttermilk-pancakes.html:60–82`, and `breakfast/buttermilk-pancakes.html:89–95` preserve those quantities, timing, yield, and preparation. The displayed 5-minute rest is the lower end of the source's 5–10-minute step. Named macros and the 12-pancake basis match at `breakfast/buttermilk-pancakes.html:110–119`. Gram conversions and 20% cooking loss at `breakfast/buttermilk-pancakes.html:125–129` aren't source-verified measurements.
- **Treatment:** Retain. Preserve the already-corrected scalable buttermilk substitution at `breakfast/buttermilk-pancakes.html:103`. No missing principal ingredient, quantity change, or macro swap was established.

### 3. Chocolate Zucchini Bread: Several current-source adaptations

Original URL: https://sallysbakingaddiction.com/double-chocolate-zucchini-bread/

- **Original facts:** “1 loaf; 10 slices”; prep 15 minutes, cook 50, total 2 hours. It allows “natural or dutch-process cocoa powder”, avocado/olive/melted coconut oil, and Greek yogurt or sour cream. Zucchini is “about 185g”. Its smaller pan is “8.5×4.5-inch”; baking is 45–55 minutes. Nutrition per slice is 246 kcal, protein 5.4 g, fat 11.9 g, carbohydrate 33.2 g.
- **Current HTML:** `desserts/chocolate-zucchini-bread.html:48–52` matches yield and times. Lines `desserts/chocolate-zucchini-bread.html:59–85` instead prohibit Dutch-process cocoa (line 60), select vegetable oil (line 67), retain sour cream as a substitution, and give 180 g zucchini (line 85). `desserts/chocolate-zucchini-bread.html:92–95` specifies an 8×4-inch smaller pan. The source itself later abbreviates that pan to 8×4 in its bake-time discussion, so its preparation text isn't fully consistent. Local nutrition at `desserts/chocolate-zucchini-bread.html:114–122` is explicitly an ingredient estimate: 248 kcal, protein 4.9 g, fat 10.9 g, carbohydrate 34.9 g. It isn't labeled copied source nutrition. The weights at `desserts/chocolate-zucchini-bread.html:128–132` remain local estimates.
- **Treatment:** Owner/source clarification before changing cocoa, oil, zucchini grams, or pan size. These could reflect an earlier source or an intentional adaptation. A source-faithful preview could expose them together, but automatic replacement would erase choices without establishing their history. Don't overwrite local estimated macros with the current source's panel by default.

### 4. Chicken Broccoli Rice Casserole: Retain the local weight correction

Original URL: https://thecozycook.com/broccoli-cheddar-chicken-and-rice-casserole/

- **Original facts:** Six people; prep 10, cook 50, total 60 minutes. It lists “2 boneless skinless chicken breasts (or 2 cups diced rotisserie chicken)”, 1¼ cups uncooked rice, 2–3 cups broccoli, two separate 2-tablespoon butter amounts, and a 1-cup crushed Ritz topping. Rice cooks 6 minutes, then 9 with broccoli, then rests covered 10 minutes. Baking is 15 minutes covered plus 10 uncovered. Source nutrition per serving is 511 kcal, protein 23 g, fat 33 g, carbohydrate 30 g.
- **Current HTML:** `main-dishes/chicken-broccoli-rice-casserole.html:48–52`, `main-dishes/chicken-broccoli-rice-casserole.html:59–103`, and `main-dishes/chicken-broccoli-rice-casserole.html:110–123` preserve the principal amounts and method. The local approximately 450 g chicken conversion isn't specified by the original and shouldn't be assumed equal for both chicken options. Local nutrition at `main-dishes/chicken-broccoli-rice-casserole.html:139–144` is an ingredient estimate, approximately 615 kcal, protein 35.5 g, fat 32.5 g, carbohydrate 46 g. That differs from, but doesn't claim to reproduce, the source panel. The corrected weight range at `main-dishes/chicken-broccoli-rice-casserole.html:150–154` now explicitly distinguishes summed local grams from unmeasured cooking loss.
- **Treatment:** Retain the corrected range and matching ingredient inventory. Clarify chicken/metric and nutrition assumptions if further precision is wanted. Re-extraction isn't a substitute for measuring chicken or choosing a nutrition basis.

### 5. Mac & Cheese Crockpot Magic: Intentional-looking threefold batch

Original URL: https://www.pictureperfectmeals.com/recipes/mac-cheese-crockpot-magic-recipe/

- **Original facts:** Yield 8; prep 10 minutes and total 3 hours 10 minutes. The visible card gives “Cook Time: 2-3 hours”; its structured `cookTime` is malformed (`PT-497829H13M15S`). It lists “16 oz (450g) elbow macaroni”, 3/1/1 cups cheddar/mozzarella/Gruyere or Parmesan, 4 cups whole milk, one 12 oz evaporated milk can, and ½ cup butter. It says to stir every 45 minutes and check tenderness around 2½ hours. Nutrition reports 624 kcal, protein 25 g, fat 34 g, carbohydrate 54 g, but calls its nutrition “Serving Size: 8”.
- **Current HTML:** `main-dishes/mac-and-cheese-crockpot-magic.html:48–52` uses 24 servings, prep 15 minutes, cook 2 hours 55 minutes, with the same total. Principal quantities at `main-dishes/mac-and-cheese-crockpot-magic.html:59–88` are consistently threefold, including 48 oz pasta, 12 cups milk, and three cans evaporated milk. The source's explicit cheese/pasta/butter grams are also tripled. Preparation at `main-dishes/mac-and-cheese-crockpot-magic.html:95–104` follows the source's method. Nutrition at `main-dishes/mac-and-cheese-crockpot-magic.html:120–130` keeps the source numbers and labels them per serving. That interpretation needs clarification because the source's serving-size field is ambiguous. Batch weights at `main-dishes/mac-and-cheese-crockpot-magic.html:136–140` aren't source-provided measurements.
- **Treatment:** Retain the coherent 24-serving adaptation, subject to owner confirmation. Don't collapse it to 8 servings or copy the malformed duration. Clarify per-portion nutrition and the changed prep/cook split. This source is a poor automatic re-extraction candidate because its metadata already contains defects.

### 6. Mapo Tofu: Source comparison blocked

Original URL: https://thewoksoflife.com/ma-po-tofu-real-deal/

- **Access:** HTTP 403 twice. No current original quantities, yield, preparation, or nutrition values were retrieved, so no source quote or source match is claimed.
- **Current HTML:** `main-dishes/mapo-tofu.html:50–54` gives six servings and 10/25/35-minute prep/cook/total. Ingredients at `main-dishes/mapo-tofu.html:61–82` include 1 lb tofu, 8 oz pork, ½ cup oil, and ranged bean sauce/peppercorn amounts. The corrected steps at `main-dishes/mapo-tofu.html:100–106` split the listed oil proportionally. `main-dishes/mapo-tofu.html:122–133` reports source nutrition of 335 kcal, protein 11 g, fat 29 g, carbohydrate 8 g for six servings. That provenance remains unverified here. Weights at `main-dishes/mapo-tofu.html:139–143` are also unverified.
- **Treatment:** Owner/source clarification or a user-supplied public source snapshot. Retain current manual corrections meanwhile. An inaccessible source isn't a reason to guess, pay for access, or run re-extraction against missing content.

### 7. Pailin's Authentic Pad Thai: Highest-priority food/amount gaps

Original URL: https://hot-thai-kitchen.com/best-pad-thai/

- **Original facts:** Two servings; prep 30, cook 10, total 40 minutes, while the noodles explicitly soak for 1 hour. Sauce includes “3 Tbsp (45 ml) water”, 35 g palm sugar, 3–4 tablespoons tamarind, and 2 tablespoons fish sauce. It lists “2 Tbsp dried shrimp”, 120 g bean sprouts, 70 g chives, and 115 g dry noodles. Directions add water with fish sauce and tamarind immediately after caramelizing sugar, simmer, and let the sugar finish dissolving. It returns cooked protein to the wok before sprouts/chives and uses half the peanuts in the toss. The source's nutrition record supplies 682 calories for “Serving Size: 1”, without protein/fat/carbohydrate values.
- **Current HTML:** `main-dishes/pailins-authentic-pad-thai.html:50–54` retains two servings but includes the soak in a 1 hour 20 minute total. `main-dishes/pailins-authentic-pad-thai.html:61–105` omits the measured sauce water entirely and lists only 1 tablespoon dried shrimp at line 93. Tamarind is the source range's lower endpoint, 3 tablespoons at line 80. Bean sprouts are 125 g rather than the source's 120 g at line 62. The sauce step at `main-dishes/pailins-authentic-pad-thai.html:113` also omits that water and changes addition/dissolving order. Extra water for undercooked noodles at line 116 doesn't restore the missing sauce amount. `main-dishes/pailins-authentic-pad-thai.html:118–119` reserves three-fifths of sprouts for the stir-fry and serves shrimp/peanuts on top rather than following the source's final toss. This preserves the earlier scalable wording correction but isn't the same preparation. Local 793 kcal and named macros at `main-dishes/pailins-authentic-pad-thai.html:135–145` are explicitly ingredient estimates, not macros supplied by the source. The cooked weights at `main-dishes/pailins-authentic-pad-thai.html:151–155` aren't source measurements.
- **Treatment:** First direct source-alignment candidates, if approved: restore the measured sauce water in both ingredient list and sauce step, and reconcile 1 versus 2 tablespoons dried shrimp. Don't invent drained/gram weights or recalculate macros as part of that narrow correction. The timing, tamarind endpoint, sprouts allocation, and finishing method need owner intent clarified rather than automatic overwrite. Differences are established against today's original, not proven historical reading loss.

### 8. Delicious Ham and Potato Soup: Nutrition differs, not a macro swap

Original URL: https://www.allrecipes.com/recipe/56927/delicious-ham-and-potato-soup/

- **Original facts:** Eight servings, yield “8 cups”; prep 20, cook 20, total 40 minutes. Ingredients include “3.5 cups peeled and diced potatoes”, 3¼ cups water, ¾ cup ham, 5 tablespoons each butter/flour, and 2 cups milk. Potatoes simmer 10–15 minutes; a separate roux cooks 1 minute and thickens with milk 4–5 minutes before combining. The visible label says “Nutrition Facts (per serving)”: 236 kcal, fat 10 g, carbohydrate 30 g, protein 8 g. The page's modification date is January 22, 2026, not proof of when individual values changed.
- **Current HTML:** `soups-and-stews/delicious-ham-and-potato-soup.html:50–54` preserves eight servings, but gives cook 25 and total 45 minutes. Ingredients at `soups-and-stews/delicious-ham-and-potato-soup.html:61–93` and steps at `soups-and-stews/delicious-ham-and-potato-soup.html:115–117` preserve the principal recipe. Nutrition at `soups-and-stews/delicious-ham-and-potato-soup.html:132–139` instead claims source values of 195 kcal, protein 6.1 g, carbohydrate 19.5 g, fat 10.5 g. Text and `data-macro` attributes agree. These aren't the current source values, but aren't an identifiable fat/carbohydrate transposition either. Weights at `soups-and-stews/delicious-ham-and-potato-soup.html:145–149` aren't original measurements.
- **Treatment:** Owner/source clarification for older source nutrition versus refreshing to today's panel, and for the longer cook-time allowance. A dated source citation or a clearly labeled local recalculation is preferable to silently replacing a potentially historical panel. Preserve the already-corrected broth/bouillon substitution.

### 9. Jamie's Minestrone: Local matches visible ingredients, source metadata conflicts

Original URL: https://www.allrecipes.com/recipe/13333/jamies-minestrone/

- **Original facts:** Eight servings; prep 35, cook 45, total 80 minutes. Visible ingredients say “2 cups fresh or frozen green beans, cut into 1 ½-inch pieces” and “½ cup red wine (Optional)”. The same fetched page's structured ingredient record instead says “1 (15 ounce) can green beans”. Both representations include 3 tablespoons cooking oil plus a separate 1 tablespoon finishing oil, kidney beans, spinach, ½ cup pasta, and Parmesan. Pasta is cooked separately, then 2 tablespoons cooked pasta go into each bowl. Current source nutrition per recipe serving is 193 kcal, protein 7 g, fat 9 g, carbohydrate 26 g. The page reports an October 9, 2026 modification date.
- **Current HTML:** `soups-and-stews/jamies-minestrone-soup.html:49–53` matches timing/yield. `soups-and-stews/jamies-minestrone-soup.html:60–121` matches the visible fresh/frozen beans, optional wine, and separate oil amounts. Steps at `soups-and-stews/jamies-minestrone-soup.html:128–135` retain the corrected oil allocation and separately cooked pasta. Nutrition at `soups-and-stews/jamies-minestrone-soup.html:142–147` is a local ingredient estimate of 228 kcal, protein 8 g, carbohydrate 30 g, fat 9 g, not a claim to reproduce source macros. Weights at `soups-and-stews/jamies-minestrone-soup.html:153–157` are unmeasured estimates.
- **Treatment:** Retain the version matching the visible source. Don't replace fresh/frozen beans with the contradictory structured-data can. No missing principal food or macro swap was established. Source representation and local nutrition assumptions need clarification before any refresh; re-extraction could introduce a regression here.

### 10. Quick and Easy Chicken Noodle Soup: Retain

Original URL: https://www.allrecipes.com/recipe/26460/quick-and-easy-chicken-noodle-soup/

- **Original facts:** Six servings; prep 10, cook 30, total 40 minutes. It lists “4 (14.5 ounce) cans chicken broth”, one 14.5 oz vegetable broth can, ½ lb cooked chicken breast, 1½ cups egg noodles, and 1 cup carrots. Onion/celery cook about 5 minutes, then the combined soup simmers 20 minutes. Nutrition is 162 kcal, protein 13 g, fat 6 g, carbohydrate 12 g.
- **Current HTML:** `soups-and-stews/quick-and-easy-chicken-noodle-soup.html:49–53`, `soups-and-stews/quick-and-easy-chicken-noodle-soup.html:60–88`, and `soups-and-stews/quick-and-easy-chicken-noodle-soup.html:95–98` match those amounts, times, yield, and method. Nutrition values and named macro attributes at `soups-and-stews/quick-and-easy-chicken-noodle-soup.html:105–119` match the original. The added gram equivalents and batch/portion weights at `soups-and-stews/quick-and-easy-chicken-noodle-soup.html:125–129` aren't source-provided measurements.
- **Treatment:** Retain. No missing food, changed principal amount, or macro swap was established. Re-extraction offers no demonstrated correction here.

### Candidate ranking and pilot decision

| Priority | Route | Candidates and limits |
| --- | --- | --- |
| 1 | Direct deterministic source-alignment candidates | Pad Thai's missing 3 tablespoons sauce water and 1 versus 2 tablespoons dried shrimp. The current-source amounts are explicit. A source-faithful correction still needs approval; it doesn't establish historical extraction loss or authorize nutrition recalculation. |
| 2 | Owner/source clarification | Blueberry sugar's 150 versus source 170 g; zucchini bread's cocoa/oil/pan/metric differences; ham soup's changed source panel and timing; mac and cheese's nutrition serving basis and 24-serving adaptation; Mapo's inaccessible original. Clarify these rather than let an extractor choose. |
| 3 | Re-extract preview candidates only | Pad Thai first because it has multiple related food/preparation differences. Zucchini bread second only if the owner wants today's original rather than the current adaptation. Today's page can inform a preview, not prove what an older extraction lost. |
| 4 | Retain | Pancakes and chicken noodle soup match the comparable source fields. Keep the casserole's corrected weight range, Jamie's visible-source bean choice and corrected oil allocation, and the coherent threefold mac-and-cheese batch while its basis is clarified. Matching fields in other recipes should remain unchanged. |

**Pilot decision: don't run one now.** Phase 4 authorized public research, not paid extraction. The separately required six-case live evaluation remains credential-blocked as reported by the main session. `worker/README.md` documents six synthetic cases and an explicitly approved live mode capped at six calls. Credentials weren't inspected, and no live evaluation or model/API call was attempted here. Mocked or offline tests aren't evidence that a model preserves omitted foods or manual edits.

A future pilot needs separate approval after that live gate passes. Start with one Pad Thai preview, cap the pilot at one recipe and one extraction call with no automatic retries, and show a field-by-field diff without writing production HTML. Preserve all Phase 1/2 manual corrections, contributor choices, substitutions, nutrition provenance, and scaling-safe wording. If a preview can't separate source facts from local estimates or retain those edits, stop rather than overwrite. Any merge or recipe change needs its own review and approval. No automatic recipe overwrite is authorized.

## Local changes and remaining validation

- Corrected the casserole and Taco Bake weight calculations. Taco Bake retains the original estimated 15–20% cooking-loss range, not a newly selected loss percentage. Both recipes label cooked yield as unmeasured.
- Corrected onion ready-to-eat timing, reconciled pancake and soup substitutions, and listed unquantified serving accompaniments without adding them to baseline nutrition.
- Updated shared scaling to cover every ingredient section, preserve weight ranges and qualifiers, scale immediate measured-unit equivalents without scaling package sizes, and restore exact original text. Shopping merging retains package identity and sums both range endpoints. Ingredient-relative wording addresses the identified fixed food amounts; a scaled-view note identifies any remaining original-batch prose.
- Independent review found no critical/high introduced defects. Follow-up regressions cover merged-range unit grammar and the casserole's ingredient-relative chicken alternative. Previously checked packaged shopping items can appear unchecked once after the identity change; old checkmarks aren't deleted or assigned to ambiguous new package identities. The pre-existing fraction-helper cleanup observation was left outside this change.
- Qualified the three canned-food gram equivalents as packaged contents with unverified drained weight. Their nutrition and edible-yield estimates are explicitly provisional. Nana's nutrition panel is flagged as unsuitable for dietary tracking until recalculated. Gochujang Chicken's incompatible loss explanation was removed; its existing cooked/portion numbers remain explicitly unverified.
- Regenerated `assets/recipes.json` and `index.html` with the repo's generators. All 42 recipes parse; the generated index includes 388 ingredient lines after seven unquantified serving entries were added. No generated file was edited by hand.
- Source comparisons didn't trigger recipe overwrites. Pad Thai's water and dried-shrimp differences remain a separate source-alignment decision. The other source-dependent questions above remain open.

`node --test worker/test/*.test.js` passed 312 tests with zero failures or skips. Regressions cover the corrections, recipe-relative wording, shared consumers, uncertainty labels, generated-index consistency, review follow-ups, and fixture syntax. `node --check` passed for both shared scripts, and `git diff --check` passed. Mocked extraction checks aren't live model evaluation.

**Browser validation remains unresolved.** The existing-recipe fixture didn't reach a passing verdict: initial runs returned stale-looking failures, a cache-busted run timed out loading local frames, and a subsequent direct-page snapshot timed out in the managed browser. Standalone Chrome also failed during startup. Local HTTP probes returned the current assets successfully; these observations don't establish the browser failure's root cause. Node or fixture-syntax checks aren't substitutes for a passing real-browser run. The fixture is `worker/test/browser/recipe-scaling.html`; serve the repo locally and click **Run checks** to finish that gate.

No paid extraction, credential inspection, commit, push, PR, or deployment was performed for these four phases.
