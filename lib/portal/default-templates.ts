import { CONTRACT_TYPE_META, type ContractType } from "./contract-types";

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* -------------------------------------------------------------------------
 * Smlouva o provozování provozovny (operation)
 * Manažer = BOServices (provider). Franšízant = klient. BOServices
 * provozuje provozovnu pro klienta - vede personál, sklad, tržby.
 * Hardcoded: odměna 30 000 Kč, fakturace 22. den, výpovědní doba 3 měsíce.
 * ------------------------------------------------------------------------- */
function operationHtml(): string {
  return `<h2>Smluvní strany</h2>
<p><strong>{{providerName}}</strong>, IČO: {{providerIco}}, DIČ: {{providerDic}}, se sídlem {{providerStreet}}, {{providerZip}} {{providerCity}}, zastoupená {{providerStatutory1Name}}, {{providerStatutory1Role}}, a {{providerStatutory2Name}}, {{providerStatutory2Role}} (dále jen „<strong>Manažer</strong>“)</p>
<p>a</p>
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, DIČ: {{clientDic}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}, zastoupená {{clientStatutoryName}}, {{clientStatutoryRole}}, e-mail: {{clientEmail}}, telefon: {{clientPhone}} (dále jen „<strong>Franšízant</strong>“)</p>
<p>Manažer a Franšízant společně dále jen „<strong>Smluvní strany</strong>“.</p>

<h2>1. Úvodní ustanovení</h2>
<ol>
  <li>Manažer a Franšízant uzavřeli téhož dne franšízingovou smlouvu (dále jen „<strong>Franšízingová smlouva</strong>“), na jejímž základě je Franšízant oprávněn provozovat provozovnu na adrese <strong>{{provozovnaAddress}}</strong> (dále jen „<strong>Provozovna</strong>“). Franšízant je vlastníkem vybavení Provozovny.</li>
  <li>Franšízant má zájem o zajištění provozování Provozovny Manažerem a Manažer má zájem o provozování Provozovny pro Franšízanta. Účelem této Smlouvy je úprava podmínek tohoto provozování.</li>
</ol>

<h2>2. Provoz a hospodaření Provozovny</h2>
<ol>
  <li>Manažer zajistí plný provoz Provozovny jako její provozovatel ve smyslu zákona č. 455/1991 Sb., o živnostenském podnikání, a to na vlastní jméno a vlastní odpovědnost. Manažer zejména:
    <ol>
      <li>zajišťuje personální obsazení Provozovny a vede mzdovou a personální agendu; pracovníci Provozovny jsou zaměstnanci Manažera,</li>
      <li>plní povinnosti vyplývající z nájemní smlouvy k Provozovně,</li>
      <li>vede skladové hospodářství (suroviny, zboží, spotřební materiál),</li>
      <li>zabezpečuje a zpracovává přijaté hotovostní tržby,</li>
      <li>vyplácí Franšízantovi tržby snížené o náklady dle této Smlouvy.</li>
    </ol>
  </li>
  <li>Náklady vzniklé v souvislosti s provozem Provozovny (dále jen „<strong>Náklady</strong>“) hradí Manažer, a to buď z vlastních prostředků, nebo z prostředků v rámci přijatých hotovostních tržeb Provozovny. Za Náklady se považují zejména:
    <ol>
      <li>náklady související s nájemní smlouvou (nájem, energie a služby spojené s nájmem, vybavení a další pravidelné platby pronajímateli),</li>
      <li>osobní náklady zaměstnanců Provozovny (mzdy, odvody, benefity), jakož náklady na osoby dodávající prodejní službu (IČaři),</li>
      <li>suroviny, zboží a spotřební materiál pořízený v souvislosti s provozem Provozovny,</li>
      <li>pojištění Provozovny,</li>
      <li>správní pokuty a jiné sankce uložené v souvislosti s provozem Provozovny,</li>
      <li>náklady na obnovu vybavení provozovny a drobné investice.</li>
    </ol>
  </li>
  <li>Manažer nejpozději do <strong>22. dne</strong> kalendářního měsíce následujícího po měsíci, za který se vyúčtování provádí, vyčíslí Náklady Provozovny a provede jejich fakturaci na Franšízanta s aplikací příslušné sazby DPH. Manažer má právo započíst svou pohledávku z titulu Nákladů fakturovaných dle tohoto článku Franšízantovi oproti svým závazkům vůči Franšízantovi.</li>
  <li>Hotovostní tržby, které Manažer obdrží v souvislosti s Provozovnou, jsou ve vlastnictví Franšízanta, přičemž měsíční hotovostní tržby, v rozsahu, ve kterém nebyly použity k úhradě Nákladů, předá Manažer Franšízantovi hotovostním či bezhotovostním způsobem (dle volby Franšízanta) do <strong>22. dne</strong> měsíce následujícího po měsíci, kterého se dané hotovostní tržby týkají. Bezhotovostní tržby Provozovny se řídí režimem upraveným ve Franšízingové smlouvě.</li>
  <li>Ve vztahu k hotovostním tržbám provádí Manažer jejich prostou správu. Manažer může tyto prostředky používat zejména v souvislosti s provozem Provozovny (např. při rozměňování hotovostních prostředků zákazníkům), pro účely úhrady Nákladů či úhradu pohledávek Manažera za Franšízantem.</li>
  <li>Manažer je povinen na žádost Franšízanta předložit Franšízantovi podklady k vyúčtování (zejména doklady o tržbách, mzdové a nájemní náklady, faktury dodavatelů) v rozsahu nezbytném k ověření vyúčtování dle této Smlouvy.</li>
  <li>Ustanovení tohoto článku je nutné vykládat tak, že úmyslem Smluvních stran je upravit práva a povinnosti způsobem, aby Franšízantovi byl vyplácen čistý zisk Provozovny (tj. tržby po odečtení Nákladů a Odměny) a zároveň, aby Franšízant nesl ztrátu Provozovny (pokud Náklady a Odměna budou převyšovat tržby).</li>
</ol>

<h2>3. Odměna Manažera</h2>
<ol>
  <li>Za služby dle této Smlouvy náleží Manažerovi měsíční odměna ve výši <strong>30 000 Kč</strong> bez DPH (dále jen „<strong>Odměna</strong>“). Odměna náleží Manažerovi bez ohledu na to, zda Provozovna v daném měsíci dosáhla zisku nebo ztráty; Odměna je splatná 22. den měsíce následujícího po měsíci, za který se Odměna týká, a to na základě vystavené faktury.</li>
  <li>K Odměně bude připočteno DPH v sazbě dle platných právních předpisů. Faktura bude vystavena v měně CZK, EUR nebo PLN, a to dle vhodnosti podle typu lokace a umístění Provozovny. Měnu fakturace určí Manažer písemným oznámením Franšízantovi, popřípadě ji Smluvní strany sjednají v dodatku k této Smlouvě. Není-li určeno jinak, je výchozí měnou fakturace CZK.</li>
  <li>Manažer je oprávněn vždy jednou za kalendářní rok jednostranně zvýšit Odměnu o procentní přírůstek průměrného ročního indexu spotřebitelských cen za předchozí kalendářní rok, vyhlášený Českým statistickým úřadem. Takto zvýšená Odměna náleží Manažerovi zpětně od 1. ledna kalendářního roku, v němž Český statistický úřad tento údaj zveřejnil. K provedení tohoto zvýšení se nevyžaduje uzavření dodatku ke Smlouvě.</li>
  <li>Pro případ prodlení s úhradou kteréhokoli peněžitého plnění dle této Smlouvy se Smluvní strana, která je v prodlení, zavazuje platit druhé Smluvní straně od prvního dne prodlení úroky z prodlení ve výši <strong>0,1 %</strong> z dlužné částky za každý započatý den prodlení.</li>
</ol>

<h2>4. Doba trvání a ukončení Smlouvy</h2>
<ol>
  <li>Tato Smlouva se uzavírá na dobu neurčitou. Smlouva pozbývá platnosti a účinnosti dnem zániku Franšízingové smlouvy, ať už z jakéhokoli důvodu.</li>
  <li>Každá ze Smluvních stran je oprávněna tuto Smlouvu vypovědět i bez uvedení důvodu s výpovědní dobou <strong>3 měsíce</strong>. Výpovědní doba počíná běžet prvním dnem kalendářního měsíce následujícího po měsíci, ve kterém byla písemná výpověď doručena druhé Smluvní straně.</li>
  <li>Manažer je dále oprávněn tuto Smlouvu vypovědět s okamžitou účinností v případě, že Franšízant:
    <ol>
      <li>je v prodlení s úhradou kteréhokoli peněžitého plnění dle této Smlouvy o více než 30 dnů,</li>
      <li>poruší podstatným způsobem svůj závazek dle této Smlouvy a nezjedná nápravu ani ve lhůtě 7 dnů od písemné výzvy druhé Smluvní strany.</li>
    </ol>
  </li>
  <li>Výpověď i odstoupení musí být učiněny písemně a doručeny druhé Smluvní straně. Výpověď i odstoupení se mají za doručené 3. pracovní den ode dne odeslání doporučenou poštou na adresu Smluvní strany v záhlaví, do datové schránky nebo na korespondenční adresu, pokud nebudou doručeny dříve.</li>
</ol>

<h2>5. Předání Provozovny při ukončení Smlouvy</h2>
<ol>
  <li>Při ukončení této Smlouvy z jakéhokoli důvodu Manažer předá Provozovnu Franšízantovi (nebo jím určené osobě) na základě předávacího protokolu podepsaného Smluvními stranami, a to nejpozději do 3 pracovních dnů od skončení účinnosti této Smlouvy.</li>
  <li>Předání zahrnuje zejména:
    <ol>
      <li>inventuru skladu k poslednímu dni účinnosti Smlouvy s oceněním zboží a spotřebního materiálu,</li>
      <li>předání hotovosti z pokladny Provozovny proti zápisu,</li>
      <li>předání všech klíčů, přístupových karet a hesel k POS systému, kamerovému systému, internetovému bankovnictví dedikovanému Provozovně,</li>
      <li>předání HACCP a obdobné provozní dokumentace,</li>
      <li>předání evidence smluv s dodavateli souvisejících s provozem Provozovny.</li>
    </ol>
  </li>
  <li>V případě prodlení Manažera s předáním Provozovny je Franšízant oprávněn na náklady Manažera zajistit předání náhradním způsobem (zejména zámečnickou službou, externí inventurou). Tím není dotčeno právo Franšízanta na náhradu škody.</li>
</ol>

<h2>6. Odpovědnost Manažera</h2>
<ol>
  <li>Smluvní strany sjednávají, že celková výše náhrady škody, za níž Manažer odpovídá Franšízantovi v souvislosti s touto Smlouvou, je za jeden incident omezena částkou odpovídající <strong>jednonásobku měsíční Odměny</strong>. Manažer dále neodpovídá za nepřímou škodu, ušlý zisk a následné škody.</li>
</ol>

<h2>7. Závěrečná ustanovení</h2>
<ol>
  <li>Tato Smlouva nabývá platnosti a účinnosti dnem jejího podpisu oběma Smluvními stranami.</li>
  <li>Pro vyloučení všech pochybností Smluvní strany výslovně potvrzují, že tato Smlouva nezakládá společnost ve smyslu § 2716 a násl. zákona č. 89/2012 Sb., občanský zákoník, ani tiché společenství dle § 2747 a násl. téhož zákona. Smluvní strany rovněž výslovně potvrzují, že jsou podnikateli, uzavírají tuto Smlouvu při svém podnikání, a na tuto Smlouvu se neuplatní ustanovení § 1793 téhož zákona. Všechny faktury vystavené podle této Smlouvy jsou splatné 7. den od jejich vystavení, pokud není výslovně sjednáno jinak.</li>
  <li>Tuto Smlouvu lze měnit a doplňovat pouze písemnou formou vzestupně číslovaných dodatků podepsaných oběma Smluvními stranami.</li>
  <li>Je-li některé ustanovení této Smlouvy neplatné nebo neúčinné, ostatní zůstávají platná. Smluvní strany se zavazují nahradit takové ustanovení novým, které nejlépe odpovídá původnímu účelu.</li>
  <li>Zaplacením kterékoli smluvní pokuty sjednané v této Smlouvě není dotčeno právo dotčené Smluvní strany na náhradu škody v plném rozsahu, a to i v rozsahu převyšujícím sjednanou smluvní pokutu.</li>
  <li>Manažer je oprávněn tuto Smlouvu i bez souhlasu Franšízanta zčásti či zcela postoupit, přičemž postoupením se osvobozuje od svých povinností v rozsahu postoupení; Smluvní strany výslovně vylučují aplikaci § 1899 OZ.</li>
  <li>Vybavení Provozovny je ke dni podpisu této Smlouvy uvedeno v Příloze č. 1, která je nedílnou součástí této Smlouvy.</li>
</ol>

<h2>Podpisy</h2>
<p>V {{place}} dne {{contractDate}}.</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{providerStatutory1Name}}</strong><br/>{{providerStatutory1Role}}<br/>za Manažera: {{providerName}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{providerStatutory2Name}}</strong><br/>{{providerStatutory2Role}}<br/>za Manažera: {{providerName}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{clientStatutoryName}}</strong><br/>{{clientStatutoryRole}}<br/>za Franšízanta: {{clientName}}</p>

<h2>Příloha č. 1 — Vybavení Provozovny</h2>
<p><em>Doplňte seznam vybavení (kuchyňské spotřebiče, nábytek, POS, kamerový systém, ...).</em></p>`;
}

/* -------------------------------------------------------------------------
 * Smlouva o spolupráci a podpoře při provozování provozovny (cooperation)
 * Manažer = BOServices (provider). Franšízant = klient. BOServices
 * poskytuje metodickou pomoc, regionální manažer, edukace.
 * Hardcoded: odměna 30 000 Kč, fakturace 15. den.
 * ------------------------------------------------------------------------- */
function cooperationHtml(): string {
  return `<h2>Smluvní strany</h2>
<p><strong>{{providerName}}</strong>, IČO: {{providerIco}}, DIČ: {{providerDic}}, se sídlem {{providerStreet}}, {{providerZip}} {{providerCity}}, zastoupená {{providerStatutory1Name}}, {{providerStatutory1Role}}, a {{providerStatutory2Name}}, {{providerStatutory2Role}} (dále jen „<strong>Manažer</strong>“)</p>
<p>a</p>
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, DIČ: {{clientDic}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}, zastoupená {{clientStatutoryName}}, {{clientStatutoryRole}}, e-mail: {{clientEmail}}, telefon: {{clientPhone}} (dále jen „<strong>Franšízant</strong>“)</p>
<p>Manažer a Franšízant společně dále jen „<strong>Smluvní strany</strong>“.</p>

<h2>1. Úvodní ustanovení, účel Smlouvy</h2>
<ol>
  <li>Franšízant prohlašuje, že na základě franšízingové smlouvy je oprávněn provozovat provozovnu v rámci franšízingové sítě <strong>{{conceptName}}</strong> na adrese <strong>{{provozovnaAddress}}</strong> (dále jen „<strong>Provozovna</strong>“). Franšízant je vlastníkem vybavení Provozovny.</li>
  <li>Franšízant je výhradním provozovatelem Provozovny ve smyslu zákona č. 455/1991 Sb., o živnostenském podnikání.</li>
  <li>Účelem této Smlouvy je úprava podmínek, za kterých Manažer poskytuje Franšízantovi odbornou pomoc a metodické vedení k efektivnímu chodu Provozovny.</li>
</ol>

<h2>2. Odpovědnost a postavení Franšízanta</h2>
<ol>
  <li>Franšízant nese plnou a výhradní odpovědnost za provoz Provozovny, zejména za:
    <ol>
      <li>ekonomické výsledky (tržby, náklady, hospodářský výsledek),</li>
      <li>pracovněprávní vztahy se zaměstnanci (dále jen „<strong>Zaměstnanci</strong>“),</li>
      <li>zajištění zásobování zbožím a spotřebním materiálem,</li>
      <li>dodržování veškerých právních, hygienických a bezpečnostních předpisů.</li>
    </ol>
  </li>
  <li>Veškeré tržby plynoucí z provozu Provozovny náleží Franšízantovi, veškeré provozní náklady hradí Franšízant ze svých prostředků. Povinnost Franšízanta hradit franšízingový poplatek se řídí samostatnou franšízingovou smlouvou.</li>
  <li>Manažer není spoluprovozovatelem Provozovny, statutárním orgánem ani osobou plnící závazky Franšízanta vůči třetím osobám ve smyslu § 1935 a § 2914 OZ. Doporučení Manažera jsou Franšízantem realizována pouze se souhlasem a na odpovědnost Franšízanta.</li>
</ol>

<h2>3. Předmět spolupráce</h2>
<ol>
  <li>Manažer se zavazuje poskytovat Franšízantovi službu spočívající v pomoci s řízením Provozovny (dále jen „<strong>Služba</strong>“), a to prostřednictvím pověřeného pracovníka (dále jen „<strong>Regionální manažer</strong>“).</li>
  <li>Náplň činnosti Regionálního manažera zahrnuje zejména:
    <ol>
      <li>pravidelné fyzické kontroly čistoty, technického stavu a vizuálních standardů Provozovny,</li>
      <li>metodické vedení Franšízanta při dodržování standardů Konceptu a kvality zákaznického servisu, včetně poskytování zpětné vazby a návrhů k nápravě nedostatků,</li>
      <li>edukaci Franšízanta v práci s interním systémem pro objednávání zboží a spotřebního materiálu a v interpretaci reportů tržeb a nákladů,</li>
      <li>metodické vedení Franšízanta při řízení Zaměstnanců (nastavení směn, motivační a tréninkové plány) a při tvorbě procesů pro nakládání s hotovostí a uzávěrky,</li>
      <li>doporučení k lokálnímu marketingu a asistenci při jeho implementaci,</li>
      <li>účast na vybraných provozních poradách Franšízanta na jeho žádost,</li>
      <li>předávání novinek a aktualizací know-how z franšízové sítě.</li>
    </ol>
  </li>
  <li>Regionální manažer bude s Franšízantem v pravidelném kontaktu formou osobních návštěv v Provozovně, telefonických konzultací a elektronické komunikace.</li>
  <li>Smluvní strany výslovně sjednávají, že podstatou spolupráce je edukace a podpora Franšízanta. Regionální manažer vykonává činnost v součinnosti s Franšízantem, nikoliv namísto něj.</li>
</ol>

<h2>4. Vedlejší náklady a doplňkové služby</h2>
<ol>
  <li>Pokud Manažer na základě předchozí dohody s Franšízantem zajistí pro Franšízanta nad rámec běžné Služby jakékoli další služby, činnosti nebo dodávky materiálu třetích stran nezbytné pro provoz Provozovny, zavazuje se Franšízant uhradit veškeré s tím spojené náklady v plné výši. Tyto náklady budou Franšízantovi přefakturovány Manažerem nebo budou na základě dohody fakturovány třetí stranou přímo Franšízantovi.</li>
</ol>

<h2>5. Cena Služby a platební podmínky</h2>
<ol>
  <li>Franšízant se zavazuje hradit za poskytování Služby měsíční paušální odměnu ve výši <strong>30 000 Kč</strong> bez DPH (dále jen „<strong>Odměna</strong>“). K Odměně bude připočteno DPH v sazbě dle platných právních předpisů.</li>
  <li>Odměna je splatná na základě daňového dokladu (faktury) vystaveného Manažerem nejpozději <strong>15. dne</strong> kalendářního měsíce následujícího po měsíci, za který se Odměna účtuje, se splatností minimálně 14 dnů. Faktura bude vystavena v měně CZK, EUR nebo PLN, a to dle vhodnosti podle typu lokace a umístění Provozovny. Měnu fakturace určí Manažer písemným oznámením Franšízantovi. Není-li určeno jinak, je výchozí měnou fakturace CZK.</li>
  <li>Odměna je splatná bez ohledu na výši tržeb Provozovny v daném měsíci. Případná provozní ztráta Provozovny nemá vliv na výši Odměny. Smluvní strany výslovně potvrzují, že v případě provozní ztráty nese veškeré podnikatelské riziko spojené s provozem Provozovny Franšízant.</li>
  <li>Manažer je oprávněn vždy jednou za kalendářní rok jednostranně zvýšit Odměnu o procentní přírůstek průměrného ročního indexu spotřebitelských cen za předchozí kalendářní rok, vyhlášený Českým statistickým úřadem. Takto zvýšená Odměna náleží Manažerovi zpětně od 1. ledna kalendářního roku, v němž Český statistický úřad tento údaj zveřejnil.</li>
  <li>Pro případ prodlení Franšízanta s úhradou Odměny se Franšízant zavazuje platit Manažerovi od prvního dne prodlení úroky z prodlení ve výši <strong>0,1 %</strong> z dlužné částky za každý započatý den prodlení.</li>
</ol>

<h2>6. Trvání a ukončení Smlouvy</h2>
<ol>
  <li>Tato Smlouva se uzavírá na dobu neurčitou.</li>
  <li>Franšízant je oprávněn tuto Smlouvu vypovědět kdykoli i bez uvedení důvodu. Smlouva v takovém případě končí k poslednímu dni kalendářního měsíce, ve kterém byla písemná výpověď doručena Manažerovi.</li>
  <li>Manažer je oprávněn tuto Smlouvu vypovědět v případě, že je Franšízant v prodlení s úhradou Odměny a tuto Odměnu neuhradí ani do 7 dnů ode dne, kdy byl k její úhradě Manažerem písemně vyzván. Smlouva v takovém případě končí k poslednímu dni kalendářního měsíce, ve kterém byla písemná výpověď doručena Franšízantovi.</li>
</ol>

<h2>7. Odpovědnost Manažera</h2>
<ol>
  <li>Doporučení Manažera (Regionálního manažera) mají charakter best-practice metodiky. Franšízant je povinen je posoudit s přihlédnutím ke konkrétním podmínkám své Provozovny a v případě pochybností konzultovat s odborně způsobilou osobou. Manažer (Regionální manažer) neodpovídá za jakékoliv případné sankce či jiné veřejnoprávní postihy uložené Franšízantovi.</li>
  <li>Smluvní strany sjednávají, že celková výše náhrady škody, za níž Manažer odpovídá Franšízantovi v souvislosti s touto Smlouvou (zejména dle § 2950 OZ), je za jeden incident omezena částkou odpovídající <strong>jednonásobku měsíční Odměny</strong>. Manažer dále neodpovídá za nepřímou škodu, ušlý zisk a následné škody.</li>
  <li>Franšízant se zavazuje odškodnit Manažera za jakékoli sankce uložené veřejnoprávními orgány vůči Provozovně (zejména hygienické, daňové, pracovněprávní), ledaže by byly způsobeny prokázanou hrubou nedbalostí nebo úmyslem Manažera.</li>
</ol>

<h2>8. Závěrečná ustanovení</h2>
<ol>
  <li>Tato Smlouva nabývá platnosti a účinnosti dnem jejího podpisu oběma Smluvními stranami.</li>
  <li>Pro vyloučení všech pochybností Smluvní strany výslovně potvrzují, že jsou podnikateli, uzavírají tuto Smlouvu při svém podnikání, a na tuto Smlouvu se neuplatní ustanovení § 1793 OZ. Tato Smlouva nezakládá společnost ve smyslu § 2716 a násl. OZ ani tiché společenství dle § 2747 a násl. OZ.</li>
  <li>Manažer je oprávněn tuto Smlouvu i bez souhlasu Franšízanta zčásti či zcela postoupit, přičemž postoupením se osvobozuje od svých povinností v rozsahu postoupení; Smluvní strany výslovně vylučují aplikaci § 1899 OZ.</li>
  <li>Tuto Smlouvu lze měnit a doplňovat pouze písemnou formou vzestupně číslovaných dodatků podepsaných oběma Smluvními stranami.</li>
  <li>Je-li některé ustanovení této Smlouvy neplatné nebo neúčinné, ostatní zůstávají platná. Smluvní strany se zavazují nahradit takové ustanovení novým, které nejlépe odpovídá původnímu účelu.</li>
</ol>

<h2>Podpisy</h2>
<p>V {{place}} dne {{contractDate}}.</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{providerStatutory1Name}}</strong><br/>{{providerStatutory1Role}}<br/>za Manažera: {{providerName}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{providerStatutory2Name}}</strong><br/>{{providerStatutory2Role}}<br/>za Manažera: {{providerName}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{clientStatutoryName}}</strong><br/>{{clientStatutoryRole}}<br/>za Franšízanta: {{clientName}}</p>`;
}

/* -------------------------------------------------------------------------
 * Generic skeleton (původní default) — použito pro typy, které ještě
 * nemají specifickou šablonu (franchise).
 * ------------------------------------------------------------------------- */
function genericSkeleton(type: ContractType): string {
  const meta = CONTRACT_TYPE_META[type];
  return `<h1>${escape(meta.fullName)}</h1>
<p>uzavřená dnešního dne, měsíce a roku mezi smluvními stranami:</p>
<h2>Smluvní strany</h2>
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}, zastoupená {{clientStatutoryName}}, {{clientStatutoryRole}} (dále jen „Klient“);</p>
<p>a</p>
<p><strong>{{providerName}}</strong>, IČO: {{providerIco}}, se sídlem {{providerStreet}}, {{providerZip}} {{providerCity}}, zastoupená {{providerStatutory1Name}}, {{providerStatutory1Role}}, a {{providerStatutory2Name}}, {{providerStatutory2Role}} (dále jen „Poskytovatel“).</p>
<h2>1. Předmět smlouvy</h2>
<p>Doplňte předmět smlouvy.</p>
<h2>2. Práva a povinnosti smluvních stran</h2>
<p>Doplňte práva a povinnosti.</p>
<h2>3. Cena a platební podmínky</h2>
<p>Doplňte cenu a platební podmínky.</p>
<h2>4. Doba trvání smlouvy</h2>
<p>Doplňte ujednání o době trvání.</p>
<h2>5. Závěrečná ustanovení</h2>
<p>Tato smlouva je vyhotovena ve dvou stejnopisech, z nichž každá smluvní strana obdrží po jednom. Smlouva nabývá platnosti a účinnosti dnem podpisu oběma smluvními stranami.</p>
<p>V {{place}} dne {{contractDate}}.</p>
<p>__________________<br/>{{clientStatutoryName}}<br/>za Klienta</p>
<p>__________________<br/>{{providerStatutory1Name}}<br/>za Poskytovatele</p>
<p>__________________<br/>{{providerStatutory2Name}}<br/>za Poskytovatele</p>`;
}

/* -------------------------------------------------------------------------
 * Smlouva o postoupení pohledávek (claim-assignment)
 * Postupitel = klient. Postupník = BOServices.
 * ------------------------------------------------------------------------- */
function claimAssignmentHtml(): string {
  return `<h2>Smluvní strany</h2>
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}, zastoupená {{clientStatutoryName}}, {{clientStatutoryRole}} (dále jen „<strong>Postupitel</strong>“)</p>
<p>a</p>
<p><strong>{{providerName}}</strong>, IČO: {{providerIco}}, DIČ: {{providerDic}}, se sídlem {{providerStreet}}, {{providerZip}} {{providerCity}}, zastoupená {{providerStatutory1Name}}, {{providerStatutory1Role}}, a {{providerStatutory2Name}}, {{providerStatutory2Role}} (dále jen „<strong>Postupník</strong>“)</p>
<p>Postupitel a Postupník dále společně jako „<strong>Strany</strong>“ a každý jednotlivě jako „Strana“.</p>

<h2>1. Vymezení postupovaných pohledávek a postoupení pohledávek</h2>
<ol>
  <li>Postupitel eviduje vůči společnosti <strong>{{debtorName}}</strong>, IČO: {{debtorIco}}, se sídlem {{debtorStreet}}, {{debtorZip}} {{debtorCity}} (dále jen „<strong>Dlužník</strong>“) pohledávky, přičemž Postupitel má zájem postoupit na základě této smlouvy veškeré své pohledávky za Dlužníkem.</li>
  <li>Pro účely této smlouvy se Pohledávkami rozumí ve smyslu § 1887 zákona č. 89/2012 Sb., občanský zákoník, ve znění pozdějších předpisů (dále jen „<strong>OZ</strong>“) soubor všech současně existujících i budoucích peněžitých pohledávek Postupitele za Dlužníkem z obchodního styku, a to pohledávek vzniklých zejména ze smlouvy o {{originContractTitle}} ze dne {{originContractDate}} (dále jen „<strong>Pohledávky</strong>“).</li>
  <li>Seznam aktuálně existujících pohledávek v celkové výši {{totalClaimsAmount}} je uveden v příloze č. 1 této Smlouvy.</li>
  <li>Postupitel účinností této Smlouvy postupuje Postupníkovi Pohledávky včetně příslušenství, a to s veškerými právy a povinnostmi s nimi spojenými. Postupník Pohledávky přijímá v jejich aktuálním stavu.</li>
  <li>Postupník prohlašuje, že se před uzavřením Smlouvy seznámil s právním a faktickým stavem Pohledávek.</li>
</ol>

<h2>2. Úplata a další ustanovení</h2>
<ol>
  <li>Postupitel vyrozumí Dlužníka o postoupení Pohledávek bez zbytečného odkladu po podpisu této Smlouvy.</li>
  <li>Postupitel je na žádost Postupníka povinen předat Postupníkovi veškeré dokumenty dokládající existenci Pohledávek, jakož i poskytnout mu další podklady a informace, které mohou být relevantní pro uplatňování Pohledávek.</li>
  <li>Postupník se zavazuje zaplatit Postupiteli za postoupení Pohledávek úplatu, jejíž výše a splatnost budou sjednány na základě vedlejší dohody Stran.</li>
  <li>Postupitel neodpovídá Postupníkovi za dobytnost Pohledávek.</li>
</ol>

<h2>3. Závěrečná ustanovení</h2>
<ol>
  <li>Tato Smlouva nabývá platnosti a účinnosti v okamžiku jejího podpisu všemi Stranami.</li>
  <li>Bude-li některé ujednání této Smlouvy shledáno neplatným, neúčinným, zdánlivým nebo nevymahatelným, taková neplatnost, neúčinnost či zdánlivost nebo nevymahatelnost žádným způsobem neovlivní platnost ostatních ujednání této Smlouvy. Strany se zavazují nahradit takové ujednání platným, účinným a vymahatelným ujednáním, jímž bude dosaženo stejného hospodářského výsledku.</li>
  <li>Strany se zavazují zachovávat mlčenlivost o veškerých informacích, skutečnostech, podkladech a dokumentech, které se dozvědí v souvislosti s uzavřením, plněním nebo ukončením této Smlouvy a které nejsou veřejně dostupné. Povinnost mlčenlivosti trvá i po skončení této Smlouvy.</li>
  <li>Tato Smlouva představuje úplné ujednání mezi Stranami ve vztahu k předmětu této Smlouvy a nahrazuje veškerá předchozí ujednání ohledně předmětu této Smlouvy.</li>
  <li>Tato Smlouva je vyhotovena ve dvou stejnopisech. Každá Strana obdrží jeden stejnopis. Smlouva může být měněna pouze písemnými dodatky podepsanými oběma Stranami.</li>
  <li>Strany prohlašují, že se s obsahem této Smlouvy řádně seznámily, jejímu obsahu porozuměly a bez výhrad s ním souhlasí. Smlouva byla uzavřena na základě jejich svobodné, vážné a dobrovolné vůle, což stvrzují svými vlastnoručními podpisy uvedenými níže.</li>
</ol>

<h2>Podpisy</h2>
<p>V {{place}} dne {{contractDate}}.</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{clientStatutoryName}}</strong><br/>{{clientStatutoryRole}}<br/>za Postupitele: {{clientName}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{providerStatutory1Name}}</strong><br/>{{providerStatutory1Role}}<br/>za Postupníka: {{providerName}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{providerStatutory2Name}}</strong><br/>{{providerStatutory2Role}}<br/>za Postupníka: {{providerName}}</p>

<h2>Příloha č. 1 — Seznam postupovaných existujících pohledávek</h2>
<p><em>Doplňte tabulkou s těmito sloupci: Výše pohledávky · Vznikla ze smlouvy · Titul · Splatnost.</em></p>`;
}

/* -------------------------------------------------------------------------
 * Vedlejší ujednání o úplatě (side-fee)
 * Doplňuje Smlouvu o postoupení pohledávek. Postupitel = klient.
 * Úplata 95 % a splatnost 15 pracovních dnů jsou pevně dané, neměnné.
 * ------------------------------------------------------------------------- */
function sideFeeHtml(): string {
  return `<h2>Smluvní strany</h2>
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}, zastoupená {{clientStatutoryName}}, {{clientStatutoryRole}} (dále jen „<strong>Postupitel</strong>“)</p>
<p>a</p>
<p><strong>{{providerName}}</strong>, IČO: {{providerIco}}, DIČ: {{providerDic}}, se sídlem {{providerStreet}}, {{providerZip}} {{providerCity}}, zastoupená {{providerStatutory1Name}}, {{providerStatutory1Role}}, a {{providerStatutory2Name}}, {{providerStatutory2Role}} (dále jen „<strong>Postupník</strong>“)</p>
<p>Postupitel a Postupník dále společně jako „<strong>Strany</strong>“ a každý jednotlivě jako „Strana“.</p>

<h2>1. Úvodní prohlášení a stanovení výše a splatnosti úplaty</h2>
<ol>
  <li>Dne {{originContractDate}} uzavřely Strany smlouvu o postoupení souboru pohledávek, na základě které postoupil Postupitel na Postupníka své současné a budoucí pohledávky za společností <strong>{{debtorName}}</strong>, IČO: {{debtorIco}}, se sídlem {{debtorStreet}}, {{debtorZip}} {{debtorCity}} (dále jen „<strong>Smlouva</strong>“).</li>
  <li>Ve Smlouvě si Strany sjednaly, že úplata za postoupení Pohledávek ve smyslu Smlouvy bude stanovena vedlejší dohodou Stran, což Strany uzavřením této Vedlejší dohody činí.</li>
  <li>Úplata za postoupení Pohledávek činí <strong>95 %</strong> z částky, která bude na Pohledávkách reálně vymožena (dále jen „<strong>Úplata</strong>“).</li>
  <li>Úplata bude hrazena postupně, a to ve vztahu ke každému plnění obdrženému na Pohledávky, na účet Postupitele č. {{clientBankAccount}}, do <strong>15 pracovních dnů</strong> od obdržení příslušného plnění Postupníkem.</li>
</ol>

<h2>2. Závěrečná ustanovení</h2>
<ol>
  <li>Tato Vedlejší dohoda nabývá platnosti a účinnosti v okamžiku jejího podpisu všemi Stranami.</li>
  <li>Bude-li některé ujednání této Vedlejší dohody shledáno neplatným, neúčinným, zdánlivým nebo nevymahatelným, taková neplatnost, neúčinnost či zdánlivost nebo nevymahatelnost žádným způsobem neovlivní platnost ostatních ustanovení této Vedlejší dohody. Strany se zavazují nahradit takové ujednání platným, účinným a vymahatelným ujednáním, jímž bude dosaženo stejného hospodářského výsledku.</li>
  <li>Ve vztahu k této Vedlejší dohodě se Strany zavazují zachovávat mlčenlivost ve stejném rozsahu jako ve vztahu ke Smlouvě.</li>
  <li>Tato Vedlejší dohoda představuje úplné ujednání mezi Stranami ve vztahu k jejímu předmětu a nahrazuje veškerá předchozí ujednání.</li>
  <li>Tato Vedlejší dohoda je vyhotovena ve dvou stejnopisech. Každá Strana obdrží jeden stejnopis. Změny lze činit pouze písemnými dodatky podepsanými oběma Stranami.</li>
  <li>Strany prohlašují, že se s obsahem této Vedlejší dohody řádně seznámily, jejímu obsahu porozuměly a bez výhrad s ním souhlasí.</li>
</ol>

<h2>Podpisy</h2>
<p>V {{place}} dne {{contractDate}}.</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{clientStatutoryName}}</strong><br/>{{clientStatutoryRole}}<br/>za Postupitele: {{clientName}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{providerStatutory1Name}}</strong><br/>{{providerStatutory1Role}}<br/>za Postupníka: {{providerName}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{providerStatutory2Name}}</strong><br/>{{providerStatutory2Role}}<br/>za Postupníka: {{providerName}}</p>`;
}

/* -------------------------------------------------------------------------
 * Oznámení o postoupení pohledávky (assignment-notice)
 * Postupitel (klient) informuje Dlužníka, že prodal pohledávky Postupníkovi.
 * ------------------------------------------------------------------------- */
function assignmentNoticeHtml(): string {
  return `<p><strong>{{debtorName}}</strong><br/>{{debtorStreet}}<br/>{{debtorZip}} {{debtorCity}}</p>

<p style="text-align: right"><em>Datovou schránkou / Doporučenou poštou / Předáno osobně</em></p>

<p>V {{place}} dne {{contractDate}}.</p>

<h2>Oznámení o postoupení pohledávek</h2>

<p>Vážení,</p>

<p>dovolujeme si Vás tímto informovat, že naše společnost <strong>{{clientName}}</strong>, IČO: {{clientIco}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}, jako <strong>postupitel</strong> uzavřela se společností <strong>{{providerName}}</strong>, IČO: {{providerIco}}, se sídlem {{providerStreet}}, {{providerZip}} {{providerCity}}, jako <strong>postupníkem</strong>, smlouvu o postoupení souboru <strong>veškerých peněžitých pohledávek, současných i budoucích, naší společnosti za Vámi</strong> (dále jen „<strong>Pohledávky</strong>“).</p>

<p>V návaznosti na uvedené Vás vyzýváme, abyste se ve věci Pohledávek již obraceli přímo na výše uvedeného postupníka jakožto jejich nového věřitele.</p>

<p>S pozdravem,</p>

<p>&nbsp;</p>

<p>__________________________<br/><strong>{{clientStatutoryName}}</strong><br/>{{clientStatutoryRole}}<br/>za {{clientName}}</p>`;
}

export function buildDefaultHtml(type: ContractType): string {
  switch (type) {
    case "claim-assignment":
      return claimAssignmentHtml();
    case "side-fee":
      return sideFeeHtml();
    case "assignment-notice":
      return assignmentNoticeHtml();
    case "operation":
      return operationHtml();
    case "cooperation":
      return cooperationHtml();
    default:
      return genericSkeleton(type);
  }
}
