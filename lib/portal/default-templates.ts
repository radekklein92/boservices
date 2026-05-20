import {
  CONTRACT_TYPE_META,
  DEFAULT_FRANCHISE_VARIANT,
  DEFAULT_WITHDRAWAL_VARIANT,
  type ContractType,
  type ContractVariant,
} from "./contract-types";

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
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, DIČ: {{clientDic}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}{{clientRepresentationClause}}, e-mail: {{clientEmail}}, telefon: {{clientPhone}} (dále jen „<strong>Franšízant</strong>“)</p>
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
<p>__________________________<br/><strong>{{clientSignerName}}</strong><br/>{{clientSignerRole}}<br/>za Franšízanta: {{clientName}}</p>

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
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, DIČ: {{clientDic}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}{{clientRepresentationClause}}, e-mail: {{clientEmail}}, telefon: {{clientPhone}} (dále jen „<strong>Franšízant</strong>“)</p>
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
<p>__________________________<br/><strong>{{clientSignerName}}</strong><br/>{{clientSignerRole}}<br/>za Franšízanta: {{clientName}}</p>`;
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
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}{{clientRepresentationClause}} (dále jen „Klient“);</p>
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
<p>__________________<br/>{{clientSignerName}}<br/>za Klienta</p>
<p>__________________<br/>{{providerStatutory1Name}}<br/>za Poskytovatele</p>
<p>__________________<br/>{{providerStatutory2Name}}<br/>za Poskytovatele</p>`;
}

/* -------------------------------------------------------------------------
 * Smlouva o postoupení pohledávek (claim-assignment)
 * Postupitel = klient. Postupník = BOServices.
 * ------------------------------------------------------------------------- */
function claimAssignmentHtml(): string {
  return `<h2>Smluvní strany</h2>
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}{{clientRepresentationClause}} (dále jen „<strong>Postupitel</strong>“)</p>
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
<p>__________________________<br/><strong>{{clientSignerName}}</strong><br/>{{clientSignerRole}}<br/>za Postupitele: {{clientName}}</p>
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
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}{{clientRepresentationClause}} (dále jen „<strong>Postupitel</strong>“)</p>
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
<p>__________________________<br/><strong>{{clientSignerName}}</strong><br/>{{clientSignerRole}}<br/>za Postupitele: {{clientName}}</p>
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

<p>__________________________<br/><strong>{{clientSignerName}}</strong><br/>{{clientSignerRole}}<br/>za {{clientName}}</p>`;
}

/* -------------------------------------------------------------------------
 * Franšízingová smlouva — varianta B (podnájem od BOServices)
 * Provozovna je sjednána na BOServices, franšízant si od ní podnajímá.
 * Žádné varianty v textu — všechny ujednání jsou pevně dané B-only.
 * ------------------------------------------------------------------------- */
function franchiseBHtml(): string {
  return `<h2>Smluvní strany</h2>
<p><strong>{{providerName}}</strong>, IČO: {{providerIco}}, DIČ: {{providerDic}}, se sídlem {{providerStreet}}, {{providerZip}} {{providerCity}}, zastoupená {{providerStatutory1Name}}, {{providerStatutory1Role}}, a {{providerStatutory2Name}}, {{providerStatutory2Role}} (dále jen „<strong>Poskytovatel</strong>“)</p>
<p>a</p>
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, DIČ: {{clientDic}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}{{clientRepresentationClause}}, e-mail: {{clientEmail}}, telefon: {{clientPhone}} (dále jen „<strong>Příjemce</strong>“ nebo „<strong>Franšízant</strong>“)</p>
<p>Poskytovatel a Příjemce společně dále jen „<strong>Smluvní strany</strong>“.</p>

<h2>I. Úvodní ustanovení, účel Smlouvy</h2>
<ol>
  <li>Poskytovatel zajistí, že bude nositelem práva k provozování franšízingové sítě provozoven konceptů <strong>Trdlokafe</strong>, <strong>Kytky od Pepy</strong> a <strong>Bubblify</strong> a souvisejících práv (dále jen „<strong>Koncept</strong>“).</li>
  <li>Příjemce má zájem samostatně podnikat provozováním provozovny v síti Konceptu na adrese <strong>{{provozovnaAddress}}</strong> (dále jen „<strong>Provozovna</strong>“).</li>
  <li>Účelem této Smlouvy je umožnit Příjemci provozovat Provozovnu na vlastní účet a riziko a sjednat základní pravidla vzájemné spolupráce v rámci sítě Konceptu.</li>
</ol>

<h2>II. Předmět Smlouvy</h2>
<ol>
  <li>Poskytovatel umožní za podmínek dle této Smlouvy Příjemci po dobu trvání této Smlouvy provozovat Provozovnu v rámci sítě Konceptů, a za tímto účelem Příjemci poskytne oprávnění používat:
    <ol>
      <li>značku jednoho z Konceptů včetně grafického loga a obchodních názvů produktů a služeb vytvořených v rámci sítě Konceptů,</li>
      <li>specifické prvky Provozovny (vizuální vzhled, uspořádání, obsah),</li>
      <li>originální receptury, know-how a pracovní postupy dle manuálu Poskytovatele,</li>
      <li>informační systémy sítě Konceptů (zásobovací, pokladní, docházkový, příp. další),</li>
      <li>systém školení pracovníků Příjemce,</li>
      <li>marketingovou podporu pro rozvoj Konceptu</li>
    </ol>
    (dále jen „<strong>Předmět franšízy</strong>“).
  </li>
  <li>Příjemce se zavazuje využívat oprávnění dle odst. 1 v souladu s pokyny Poskytovatele a účelem této Smlouvy tak, aby byl zachován a rozvíjen Koncept a jednotný charakter sítě Konceptu, dodržovat sjednané povinnosti a řádně a včas hradit sjednané poplatky.</li>
</ol>

<h2>III. Místo</h2>
<ol>
  <li>Poskytovatel přenechá Příjemci do podnájmu prostory Provozovny v místě sjednaném v čl. I odst. 2 této Smlouvy, a to za podmínek odpovídajících nájemní smlouvě uzavřené mezi Poskytovatelem a pronajímatelem. Příjemce se zavazuje hradit Poskytovateli podnájemné a poplatky související s podnájmem (energie, služby apod.) a složit jistotu (kauci) v rozsahu odpovídajícím povinnostem Poskytovatele vůči pronajímateli.</li>
  <li>Příjemce není oprávněn bez předchozího svolení Poskytovatele užívat Předmět franšízy na jiném místě, než je sjednáno v čl. I odst. 2 této Smlouvy, nebo umožnit její provozování či užívání třetí osobě (vyjma případu, kdy jde o zajištění provozu Provozovny prostřednictvím manažera <strong>{{providerName}}</strong> na základě samostatné smlouvy o provozování provozovny). Změnu místa, příp. rozšíření na další místa, jakož i jakékoli přenechání Provozovny nebo jejího provozu třetí osobě je nutné sjednat písemně formou dodatku k této Smlouvě.</li>
  <li>Příjemce se zavazuje po dobu trvání této Smlouvy označit Provozovnu označením jednoho z Konceptů a udržovat vizuální vzhled Provozovny dle pokynů Poskytovatele.</li>
  <li>Příjemce se zavazuje dodržovat otevírací dobu Provozovny dle podmínek určených pronajímatelem, popřípadě dle pokynů Poskytovatele.</li>
  <li>Příjemce se zavazuje, že v místě Provozovny nebude provozovat jinou činnost než Provozovnu Konceptu v souladu s Předmětem franšízy a touto Smlouvou. Dále se Příjemce zavazuje, že po dobu trvání této Smlouvy a 1 (jednoho) roku po jejím skončení nebude na území EU provozovat jakoukoli činnost, která by mohla konkurovat Konceptu, zejména prodej totožného nebo zaměnitelného sortimentu produktů a služeb, a nepřevezme zákaznickou základnu vybudovanou v rámci sítě Konceptu. Odměna za tato omezení je zohledněna v poplatcích sjednaných v čl. VI této Smlouvy.</li>
</ol>

<h2>IV. Vybavení</h2>
<ol>
  <li>Příjemce prohlašuje, že má ke dni uzavření této Smlouvy uzavřenou samostatnou smlouvu o prodeji vybavení Provozovny, respektive je již vlastníkem vybavení Prodejny. Smluvní strany výslovně sjednávají, že jakékoliv kupní smlouvy týkající se vybavení Provozovny představují samostatné závazkové vztahy a nejsou závislé na této Smlouvě ve smyslu § 1727 občanského zákoníku, není-li v konkrétní kupní smlouvě výslovně sjednáno jinak.</li>
  <li>Příjemce se zavazuje v zájmu zachování a rozvoje jednotného vzhledu a charakteristických prvků sítě Konceptu používat v Provozovně výhradně vybavení (tj. zejména nástroje, pracovní pomůcky a suroviny) odsouhlasené Poskytovatelem a vybavení si pronajímat či kupovat od Poskytovatele nebo jím určené osoby.</li>
</ol>

<h2>V. Dodávky a ceny</h2>
<ol>
  <li>Příjemce se zavazuje:
    <ol>
      <li>připravovat a nabízet produkty zákazníkům pouze dle postupů a specifikací určených Poskytovatelem pro daný Koncept,</li>
      <li>odebírat a řádně a včas hradit klíčové suroviny pro přípravu produktů a klíčové zboží a spotřební materiál jednoho z Konceptů od Poskytovatele nebo jím určené osoby. Za klíčové suroviny, zboží a spotřební materiál se považují také obalové materiály s logem, káva a další, které Poskytovatel jako klíčové suroviny, zboží či spotřební materiál označí. Ke dni uzavření této Smlouvy je Poskytovatelem osoba určená v hlavičce této Smlouvy s tím, že Poskytovatel je oprávněn určenou osobu změnit.</li>
    </ol>
  </li>
  <li>Prodejní ceny zboží a produktů v Provozovně jsou Poskytovatelem pouze doporučené. Konečnou cenu stanovuje Příjemce, musí však dbát na konkurenceschopnost Provozovny a dobré jméno sítě Konceptu.</li>
  <li>Případné výjimky ze závazků dle odst. 1 tohoto článku musí Poskytovatel předem odsouhlasit. Pokud osoba určená k dodání klíčových surovin, zboží či spotřebního materiálu dle bodu b) odst. 1 tohoto článku nebude schopna klíčové suroviny, zboží či spotřební materiál dodávat tak, aby nebyl zásadně omezen chod Provozovny, je Příjemce oprávněn tyto suroviny, zboží či spotřební materiál opatřit i od jiné osoby, je však povinen o tom neprodleně informovat Poskytovatele.</li>
  <li>Poskytovatel uvítá podněty a nápady Příjemce na rozvoj Konceptu, např. zařazení nových produktů či zboží do nabídky Provozovny nebo celé sítě Konceptu apod. Realizace těchto podnětů a nápadů podléhá předchozímu schválení Poskytovatelem.</li>
  <li>V případě prodlení Příjemce s úhradou kteréhokoli peněžitého plnění dle této Smlouvy o více než 7 dnů je Poskytovatel (resp. osoba určená dle odst. 1 písm. b) tohoto článku) oprávněn pozastavit dodávky klíčových surovin, zboží a spotřebního materiálu, a to až do úplné úhrady všech splatných pohledávek. Pozastavení dodávek z tohoto důvodu nezakládá nárok Příjemce z titulu neplnění Smlouvy ze strany Poskytovatele.</li>
</ol>

<h2>VI. Poplatek</h2>
<ol>
  <li>Příjemce se tímto zavazuje uhradit Poskytovateli jednorázový poplatek ve výši <strong>0 Kč</strong>, který bude navýšen o DPH, a to nejpozději do jednoho dne od data podpisu této Smlouvy.</li>
  <li>Příjemce se zavazuje platit Poskytovateli průběžně franšízingový a marketingový poplatek ve výši <strong>{{franchiseFeePercent}} %</strong> z měsíčního obratu bez DPH za prodej zboží a služeb (ve smyslu zákona č. 235/2004 Sb., o dani z přidané hodnoty, v aktuálním znění) Provozovny (dále jen „<strong>obrat</strong>“), dle této Smlouvy, a to nejpozději do <strong>22. dne</strong> následujícího kalendářního měsíce. Za tímto účelem bude Příjemce průběžně, nejpozději však do následujícího pracovního dne, doplňovat pravdivě a úplně data o výši denního obratu Provozovny do informačního systému provozovaného Poskytovatelem. Na základě dat z informačního systému je Poskytovatel oprávněn k poslednímu dni kalendářního měsíce vystavit daňový doklad (fakturu) na franšízingový a marketingový poplatek, se splatností minimálně 14 dnů. K poplatku bude připočítáno DPH v sazbě dle platných právních předpisů. Faktura bude vystavena v měně CZK, EUR nebo PLN, a to dle vhodnosti podle typu lokace a umístění Provozovny. Měnu fakturace určí Poskytovatel písemným oznámením Příjemci, popřípadě ji Smluvní strany sjednají v dodatku k této Smlouvě. Není-li určeno jinak, je výchozí měnou fakturace CZK.</li>
</ol>

<h2>VII. Další práva a povinnosti</h2>
<ol>
  <li>Poskytovatel je oprávněn rozvíjet koncepci sítě Konceptu a případně ji změnit či upravit, včetně názvu a grafického loga. O změnách Poskytovatel Příjemce předem informuje a poskytne mu podporu při jejich zavedení; Příjemce se zavazuje změny akceptovat v přiměřených termínech. Pokud Poskytovatel nezíská práva dle čl. I. odst. 1, je oprávněn Koncept změnit podle tohoto odstavce, což se nepovažuje za porušení Smlouvy.</li>
  <li>Poskytovatel má právo kontrolovat dodržování podmínek této Smlouvy, za tím účelem se Příjemce zavazuje umožnit Poskytovateli a jím určeným osobám vstup do Provozovny a její detailní prohlídku, umožnit Poskytovateli přístup do kamerového systému Provozovny, a dále zpřístupnění informací o hospodaření prostřednictvím systému, případně prostřednictvím dalšího účetního softwaru, které Příjemce používá.</li>
  <li>Příjemce bude provozovat svoji podnikatelskou činnost v Provozovně dle této Smlouvy pod svým vlastním jménem, na vlastní účet a riziko, a odpovídá za splnění všech právních povinností v souvislosti s provozováním Provozovny.</li>
  <li>Příjemce je oprávněn smluvně umožnit třetí osobě provozování Provozovny pouze na základě předchozího písemného souhlasu Poskytovatele. V opačném případě není Příjemce oprávněn Provozovnu přenechat třetí osobě.</li>
  <li>Příjemce se zavazuje řádně a včas plnit své závazky vůči zaměstnancům a dodavatelům. Je povinen dbát a zachovávat dobré jméno Poskytovatele a sítě Konceptu.</li>
  <li>Pro účely zajištění kontroly obratu a tržeb Provozovny a vypořádání vzájemných pohledávek se Příjemce zavazuje k inkasu bezhotovostních tržeb Provozovny používat v Provozovně platební terminál určený Poskytovatelem (dále jen „<strong>Terminál Poskytovatele</strong>“). Bezhotovostní platby přijaté prostřednictvím Terminálu Poskytovatele jsou připisovány na účet Poskytovatele a okamžikem jejich připsání se stávají součástí peněžních prostředků, s nimiž je Poskytovatel oprávněn nakládat vlastním jménem, na vlastní účet a bez povinnosti jejich oddělené správy. Smluvní strany výslovně sjednávají, že Příjemci ve vztahu k takto přijatým platbám nevzniká vlastnické právo, právo k odděleně spravovaným nebo svěřeným prostředkům ani jiné věcné právo, nýbrž pouze pohledávka Příjemce za Poskytovatelem splatná dle odst. 7 tohoto článku (dále jen „<strong>Pohledávka Příjemce na vypořádání</strong>“).</li>
  <li>Poskytovatel provádí měsíční vyúčtování bezhotovostních tržeb z Terminálu Poskytovatele, a úhradu splatných pohledávek Poskytovatele vůči Příjemci z těchto prostředků, prostřednictvím započtení, k čemuž Poskytovatel a Příjemce tímto udělují souhlas, a to nejpozději do <strong>22. dne</strong> kalendářního měsíce následujícího po měsíci, za který se vyúčtování provádí. Rozdíl (zbývající část Pohledávky Příjemce na vypořádání po započtení) ve prospěch Příjemce Poskytovatel poukáže na bankovní účet Příjemce, a to do 22. dne kalendářního měsíce následujícího po měsíci, za který se vyúčtování provádí.</li>
  <li>Poskytovatel se zavazuje, že po dobu trvání této Smlouvy nebude v místě sjednaném v čl. I odst. 2 této Smlouvy ani v okruhu <strong>500 m</strong> od něj provozovat vlastní provozovnu Konceptu ani jinou provozovnu, která by mohla být v konkurenčním postavení k Provozovně provozované Příjemcem, ani v tomto území neumožní provoz provozovny Konceptu jinému franšízantovi.</li>
  <li>Příjemce se zavazuje zachovávat mlčenlivost ohledně důvěrných informací (včetně neveřejných finančních výsledků Poskytovatele), které mu Poskytovatel předal v rámci této Smlouvy, a nesmí se mediálně ani jinak vyjadřovat k aspektům spolupráce s Poskytovatelem. Tato povinnost trvá nejdéle <strong>10 let</strong> od ukončení této Smlouvy. Za každý jednotlivý případ porušení uhradí porušitel Poskytovateli smluvní pokutu <strong>500 000 Kč</strong>, splatnou do 7 dnů od výzvy.</li>
</ol>

<h2>VIII. Sankce a ukončení Smlouvy</h2>
<ol>
  <li>Tato Smlouva je uzavřena na dobu určitou, a to <strong>10 let</strong> od uzavření této Smlouvy. Poskytovatel se zavazuje s Příjemcem před uplynutím této doby jednat o nové franšízingové smlouvě, která nebude obsahovat pro Příjemce méně výhodná ustanovení, než jaká budou v té době nabízena dalším franšízantům.</li>
  <li>Poskytovatel je oprávněn tuto Smlouvu vypovědět s výpovědní dobou 1 týden, která počíná běžet dnem doručení písemné výpovědi druhé Smluvní straně, pokud Příjemce:
    <ol>
      <li>vstoupí do likvidace nebo s ním bude zahájeno insolvenční řízení,</li>
      <li>bude jako dlužník v exekuci,</li>
      <li>bude v prodlení s úhradou kteréhokoliv z poplatků dle této Smlouvy o více než 14 dnů,</li>
      <li>změní vzhled a označení Provozovny oproti podmínkám této Smlouvy a/nebo pokynům Poskytovatele a nezjedná nápravu ani ve lhůtě 7 dnů od výzvy Poskytovatele,</li>
      <li>bude v prodlení s převzetím Provozovny a Provozovnu nepřevezme ani v dodatečné lhůtě 7 dnů od výzvy Poskytovatele,</li>
      <li>nebude plnit povinnosti vyplývající z dalších smluv uzavřených mezi Poskytovatelem a Příjemcem zároveň s touto Smlouvou,</li>
      <li>poruší své závazky nekonkurovat franšízingové síti Konceptu dle čl. III. odst. 5 této Smlouvy,</li>
      <li>poruší jiný svůj závazek dle této Smlouvy a nezjedná nápravu ani ve lhůtě 7 dnů od výzvy Poskytovatele.</li>
    </ol>
  </li>
  <li>Výpověď se má za doručenou 3. pracovní den ode dne odeslání doporučenou poštou na adresu Smluvní strany v záhlaví, do datové schránky Příjemce nebo na korespondenční adresu, pokud nebude doručena dříve.</li>
  <li>Pro případ prodlení s úhradou dlužné částky se Příjemce zavazuje platit Poskytovateli od prvního dne prodlení úroky z prodlení ve výši <strong>0,1 %</strong> z dlužné částky za každý započatý den prodlení.</li>
  <li>Pro případ porušení závazku dle čl. III. odst. 5 této Smlouvy se Příjemce zavazuje zaplatit Poskytovateli smluvní pokutu ve výši <strong>5 000 000 Kč</strong> a dále nahradit vzniklou újmu v celém rozsahu.</li>
  <li>Pokud by se Příjemce rozhodl vybavení a práva provozovat Provozovnu vyplývající z této Smlouvy prodat, může tak učinit sám a Poskytovatel se k tomu zavazuje poskytnout souhlas, nebo osloví Poskytovatele, který Provozovnu bezprostředně zařadí do své nabídky společně s dalšími franšízingovými provozovnami v nabídce Poskytovatele.</li>
  <li>Sjednáním či zaplacením kterékoli smluvní pokuty sjednané v této Smlouvě není dotčeno právo Poskytovatele na náhradu škody v plném rozsahu, a to i v rozsahu převyšujícím sjednanou smluvní pokutu. Není-li sjednáno jinak, je jakákoliv smluvní pokuta sjednaná dle této Smlouvy splatná do 7 dnů od výzvy.</li>
</ol>

<h2>IX. Závěrečná ustanovení</h2>
<ol>
  <li>Tato Smlouva nabývá platnosti a účinnosti dnem jejího podpisu oběma účastníky.</li>
  <li>Pro vyloučení všech pochybností Smluvní strany výslovně potvrzují, že jsou podnikateli, uzavírají tuto Smlouvu při svém podnikání, a na tuto Smlouvu se tudíž neuplatní ustanovení § 1793 zákona č. 89/2012 Sb., občanský zákoník, ve znění pozdějších předpisů.</li>
  <li>Tuto Smlouvu lze měnit a doplňovat pouze písemnou formou vzestupně číslovaných dodatků podepsaných oběma Smluvními stranami.</li>
  <li>Je-li některé ustanovení této Smlouvy neplatné nebo neúčinné, ostatní zůstávají platná. Smluvní strany se zavazují nahradit takové ustanovení novým, které nejlépe odpovídá původnímu účelu.</li>
  <li>Poskytovatel je oprávněn tuto Smlouvu i bez souhlasu Příjemce zčásti či zcela postoupit, přičemž postoupením se osvobozuje od svých povinností v rozsahu postoupení; Smluvní strany výslovně vylučují aplikaci ustanovení § 1899 zákona č. 89/2012 Sb., občanský zákoník, ve znění pozdějších předpisů.</li>
  <li>Příjemce není oprávněn své pohledávky za Poskytovatelem z této Smlouvy postoupit na třetí osobu bez souhlasu Poskytovatele.</li>
</ol>

<h2>Podpisy</h2>
<p>V {{place}} dne {{contractDate}}.</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{providerStatutory1Name}}</strong><br/>{{providerStatutory1Role}}<br/>za Poskytovatele: {{providerName}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{providerStatutory2Name}}</strong><br/>{{providerStatutory2Role}}<br/>za Poskytovatele: {{providerName}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{clientSignerName}}</strong><br/>{{clientSignerRole}}<br/>za Příjemce: {{clientName}}</p>`;
}

/* -------------------------------------------------------------------------
 * Franšízingová smlouva — varianta AB (nájem na franšízantovi)
 * Provozovna je sjednána na franšízanta. Smlouva obsahuje volbu A/B
 * v čl. III odst. 1 a v čl. VII odst. 6 (platební terminál).
 * ------------------------------------------------------------------------- */
function franchiseAbHtml(): string {
  return `<h2>Smluvní strany</h2>
<p><strong>{{providerName}}</strong>, IČO: {{providerIco}}, DIČ: {{providerDic}}, se sídlem {{providerStreet}}, {{providerZip}} {{providerCity}}, zastoupená {{providerStatutory1Name}}, {{providerStatutory1Role}}, a {{providerStatutory2Name}}, {{providerStatutory2Role}} (dále jen „<strong>Poskytovatel</strong>“)</p>
<p>a</p>
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, DIČ: {{clientDic}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}{{clientRepresentationClause}}, e-mail: {{clientEmail}}, telefon: {{clientPhone}} (dále jen „<strong>Příjemce</strong>“ nebo „<strong>Franšízant</strong>“)</p>
<p>Poskytovatel a Příjemce společně dále jen „<strong>Smluvní strany</strong>“.</p>

<p><em>Označení varianty čl. III odst. 1 (nájem):</em> <strong>[ ] Varianta A</strong> &nbsp;&nbsp; <strong>[ ] Varianta B</strong></p>
<p><em>Označení varianty čl. VII odst. 6 (platební terminál):</em> <strong>[ ] Varianta A</strong> &nbsp;&nbsp; <strong>[ ] Varianta B</strong></p>

<h2>I. Úvodní ustanovení, účel Smlouvy</h2>
<ol>
  <li>Poskytovatel zajistí, že bude nositelem práva k provozování franšízingové sítě provozoven konceptů <strong>Trdlokafe</strong>, <strong>Kytky od Pepy</strong> a <strong>Bubblify</strong> a souvisejících práv (dále jen „<strong>Koncept</strong>“).</li>
  <li>Příjemce má zájem samostatně podnikat provozováním provozovny v síti Konceptu na adrese <strong>{{provozovnaAddress}}</strong> (dále jen „<strong>Provozovna</strong>“).</li>
  <li>Účelem této Smlouvy je umožnit Příjemci provozovat Provozovnu na vlastní účet a riziko a sjednat základní pravidla vzájemné spolupráce v rámci sítě Konceptu.</li>
</ol>

<h2>II. Předmět Smlouvy</h2>
<ol>
  <li>Poskytovatel umožní za podmínek dle této Smlouvy Příjemci po dobu trvání této Smlouvy provozovat Provozovnu v rámci sítě Konceptů, a za tímto účelem Příjemci poskytne oprávnění používat:
    <ol>
      <li>značku jednoho z Konceptů včetně grafického loga a obchodních názvů produktů a služeb vytvořených v rámci sítě Konceptů,</li>
      <li>specifické prvky Provozovny (vizuální vzhled, uspořádání, obsah),</li>
      <li>originální receptury, know-how a pracovní postupy dle manuálu Poskytovatele,</li>
      <li>informační systémy sítě Konceptů (zásobovací, pokladní, docházkový, příp. další),</li>
      <li>systém školení pracovníků Příjemce,</li>
      <li>marketingovou podporu pro rozvoj Konceptu</li>
    </ol>
    (dále jen „<strong>Předmět franšízy</strong>“).
  </li>
  <li>Příjemce se zavazuje využívat oprávnění dle odst. 1 v souladu s pokyny Poskytovatele a účelem této Smlouvy tak, aby byl zachován a rozvíjen Koncept a jednotný charakter sítě Konceptu, dodržovat sjednané povinnosti a řádně a včas hradit sjednané poplatky.</li>
</ol>

<h2>III. Místo</h2>
<ol>
  <li>Smluvní strany sjednávají, že nájemní vztah k prostorám Provozovny bude řešen jednou z následujících variant, kterou Smluvní strany při uzavření této Smlouvy v záhlaví označí (<strong>varianta A</strong> nebo <strong>varianta B</strong>):
    <ol>
      <li><strong>Varianta A — nájem na Příjemce:</strong> Příjemce si právo užívat prostory pro Provozovnu a nájemní smlouvu k Provozovně v místě sjednaném v čl. I odst. 2 této Smlouvy zajistí nebo zajistil na vlastní odpovědnost a náklady. Poskytovatel se k tomu zavazuje poskytnout požadovanou součinnost. Příjemce se zavazuje samostatně plnit veškeré povinnosti vyplývající z nájemní smlouvy k Provozovně vůči pronajímateli, zejména hradit nájemné, energie, služby a složit veškeré požadované jistoty (kauce).</li>
      <li><strong>Varianta B — podnájem od Poskytovatele:</strong> Poskytovatel přenechá Příjemci do podnájmu prostory Provozovny v místě sjednaném v čl. I odst. 2 této Smlouvy, a to za podmínek odpovídajících nájemní smlouvě uzavřené mezi Poskytovatelem a pronajímatelem. Příjemce se zavazuje hradit Poskytovateli podnájemné a poplatky související s podnájmem (energie, služby apod.) a složit jistotu (kauci) v rozsahu odpovídajícím povinnostem Poskytovatele vůči pronajímateli.</li>
    </ol>
  </li>
  <li><em>Pro variantu A:</em> Po ukončení této Smlouvy je Příjemce povinen bez zbytečného odkladu zajistit převod nájemní smlouvy k Provozovně na Poskytovatele (nebo jím určenou osobu) a poskytnout k tomu veškerou součinnost. Dojde-li k zániku nájemní smlouvy v důsledku porušení Příjemce, je Poskytovatel oprávněn tuto Smlouvu vypovědět s okamžitou účinností.</li>
  <li>Příjemce není oprávněn bez předchozího svolení Poskytovatele užívat Předmět franšízy na jiném místě, než je sjednáno v čl. I odst. 2 této Smlouvy, nebo umožnit její provozování či užívání třetí osobě (vyjma případu, kdy jde o zajištění provozu Provozovny prostřednictvím manažera <strong>{{providerName}}</strong> na základě samostatné smlouvy o provozování provozovny). Změnu místa, příp. rozšíření na další místa, jakož i jakékoli přenechání Provozovny nebo jejího provozu třetí osobě je nutné sjednat písemně formou dodatku k této Smlouvě.</li>
  <li>Příjemce se zavazuje po dobu trvání této Smlouvy označit Provozovnu označením jednoho z Konceptů a udržovat vizuální vzhled Provozovny dle pokynů Poskytovatele.</li>
  <li>Příjemce se zavazuje dodržovat otevírací dobu Provozovny dle podmínek určených pronajímatelem, popřípadě dle pokynů Poskytovatele.</li>
  <li>Příjemce se zavazuje, že v místě Provozovny nebude provozovat jinou činnost než Provozovnu Konceptu v souladu s Předmětem franšízy a touto Smlouvou. Dále se Příjemce zavazuje, že po dobu trvání této Smlouvy a 1 (jednoho) roku po jejím skončení nebude na území EU provozovat jakoukoli činnost, která by mohla konkurovat Konceptu, zejména prodej totožného nebo zaměnitelného sortimentu produktů a služeb, a nepřevezme zákaznickou základnu vybudovanou v rámci sítě Konceptu. Odměna za tato omezení je zohledněna v poplatcích sjednaných v čl. VI této Smlouvy.</li>
</ol>

<h2>IV. Vybavení</h2>
<ol>
  <li>Příjemce prohlašuje, že má ke dni uzavření této Smlouvy uzavřenou samostatnou smlouvu o prodeji vybavení Provozovny, respektive je již vlastníkem vybavení Prodejny. Smluvní strany výslovně sjednávají, že jakékoliv kupní smlouvy týkající se vybavení Provozovny představují samostatné závazkové vztahy a nejsou závislé na této Smlouvě ve smyslu § 1727 občanského zákoníku, není-li v konkrétní kupní smlouvě výslovně sjednáno jinak.</li>
  <li>Příjemce se zavazuje v zájmu zachování a rozvoje jednotného vzhledu a charakteristických prvků sítě Konceptu používat v Provozovně výhradně vybavení (tj. zejména nástroje, pracovní pomůcky a suroviny) odsouhlasené Poskytovatelem a vybavení si pronajímat či kupovat od Poskytovatele nebo jím určené osoby.</li>
</ol>

<h2>V. Dodávky a ceny</h2>
<ol>
  <li>Příjemce se zavazuje:
    <ol>
      <li>připravovat a nabízet produkty zákazníkům pouze dle postupů a specifikací určených Poskytovatelem pro daný Koncept,</li>
      <li>odebírat a řádně a včas hradit klíčové suroviny pro přípravu produktů a klíčové zboží a spotřební materiál jednoho z Konceptů od Poskytovatele nebo jím určené osoby. Za klíčové suroviny, zboží a spotřební materiál se považují také obalové materiály s logem, káva a další, které Poskytovatel jako klíčové suroviny, zboží či spotřební materiál označí. Ke dni uzavření této Smlouvy je Poskytovatelem osoba určená v hlavičce této Smlouvy s tím, že Poskytovatel je oprávněn určenou osobu změnit.</li>
    </ol>
  </li>
  <li>Prodejní ceny zboží a produktů v Provozovně jsou Poskytovatelem pouze doporučené. Konečnou cenu stanovuje Příjemce, musí však dbát na konkurenceschopnost Provozovny a dobré jméno sítě Konceptu.</li>
  <li>Případné výjimky ze závazků dle odst. 1 tohoto článku musí Poskytovatel předem odsouhlasit. Pokud osoba určená k dodání klíčových surovin, zboží či spotřebního materiálu dle bodu b) odst. 1 tohoto článku nebude schopna klíčové suroviny, zboží či spotřební materiál dodávat tak, aby nebyl zásadně omezen chod Provozovny, je Příjemce oprávněn tyto suroviny, zboží či spotřební materiál opatřit i od jiné osoby, je však povinen o tom neprodleně informovat Poskytovatele.</li>
  <li>Poskytovatel uvítá podněty a nápady Příjemce na rozvoj Konceptu, např. zařazení nových produktů či zboží do nabídky Provozovny nebo celé sítě Konceptu apod. Realizace těchto podnětů a nápadů podléhá předchozímu schválení Poskytovatelem.</li>
  <li>V případě prodlení Příjemce s úhradou kteréhokoli peněžitého plnění dle této Smlouvy o více než 7 dnů je Poskytovatel (resp. osoba určená dle odst. 1 písm. b) tohoto článku) oprávněn pozastavit dodávky klíčových surovin, zboží a spotřebního materiálu, a to až do úplné úhrady všech splatných pohledávek. Pozastavení dodávek z tohoto důvodu nezakládá nárok Příjemce z titulu neplnění Smlouvy ze strany Poskytovatele.</li>
</ol>

<h2>VI. Poplatek</h2>
<ol>
  <li>Příjemce se tímto zavazuje uhradit Poskytovateli jednorázový poplatek ve výši <strong>0 Kč</strong>, který bude navýšen o DPH, a to nejpozději do jednoho dne od data podpisu této Smlouvy.</li>
  <li>Příjemce se zavazuje platit Poskytovateli průběžně franšízingový a marketingový poplatek ve výši <strong>{{franchiseFeePercent}} %</strong> z měsíčního obratu bez DPH za prodej zboží a služeb (ve smyslu zákona č. 235/2004 Sb., o dani z přidané hodnoty, v aktuálním znění) Provozovny (dále jen „<strong>obrat</strong>“), dle této Smlouvy, a to nejpozději do <strong>22. dne</strong> následujícího kalendářního měsíce. Za tímto účelem bude Příjemce průběžně, nejpozději však do následujícího pracovního dne, doplňovat pravdivě a úplně data o výši denního obratu Provozovny do informačního systému provozovaného Poskytovatelem. Na základě dat z informačního systému je Poskytovatel oprávněn k poslednímu dni kalendářního měsíce vystavit daňový doklad (fakturu) na franšízingový a marketingový poplatek, se splatností minimálně 14 dnů. K poplatku bude připočítáno DPH v sazbě dle platných právních předpisů. Faktura bude vystavena v měně CZK, EUR nebo PLN, a to dle vhodnosti podle typu lokace a umístění Provozovny. Měnu fakturace určí Poskytovatel písemným oznámením Příjemci, popřípadě ji Smluvní strany sjednají v dodatku k této Smlouvě. Není-li určeno jinak, je výchozí měnou fakturace CZK.</li>
</ol>

<h2>VII. Další práva a povinnosti</h2>
<ol>
  <li>Poskytovatel je oprávněn rozvíjet koncepci sítě Konceptu a případně ji změnit či upravit, včetně názvu a grafického loga. O změnách Poskytovatel Příjemce předem informuje a poskytne mu podporu při jejich zavedení; Příjemce se zavazuje změny akceptovat v přiměřených termínech. Pokud Poskytovatel nezíská práva dle čl. I. odst. 1, je oprávněn Koncept změnit podle tohoto odstavce, což se nepovažuje za porušení Smlouvy.</li>
  <li>Poskytovatel má právo kontrolovat dodržování podmínek této Smlouvy, za tím účelem se Příjemce zavazuje umožnit Poskytovateli a jím určeným osobám vstup do Provozovny a její detailní prohlídku, umožnit Poskytovateli přístup do kamerového systému Provozovny, a dále zpřístupnění informací o hospodaření prostřednictvím systému, případně prostřednictvím dalšího účetního softwaru, které Příjemce používá.</li>
  <li>Příjemce bude provozovat svoji podnikatelskou činnost v Provozovně dle této Smlouvy pod svým vlastním jménem, na vlastní účet a riziko, a odpovídá za splnění všech právních povinností v souvislosti s provozováním Provozovny.</li>
  <li>Příjemce je oprávněn smluvně umožnit třetí osobě provozování Provozovny pouze na základě předchozího písemného souhlasu Poskytovatele. V opačném případě není Příjemce oprávněn Provozovnu přenechat třetí osobě.</li>
  <li>Příjemce se zavazuje řádně a včas plnit své závazky vůči zaměstnancům a dodavatelům. Je povinen dbát a zachovávat dobré jméno Poskytovatele a sítě Konceptu.</li>
  <li>Pro účely zajištění kontroly obratu a tržeb Provozovny a vypořádání vzájemných pohledávek se Smluvní strany dohodly na uplatnění jedné z níže uvedených variant, kterou při podpisu Smlouvy zvolí označením příslušného pole v záhlaví:
    <ol>
      <li><strong>Varianta A — Vlastní platební terminál Příjemce:</strong> Příjemce je oprávněn pro inkaso bezhotovostních tržeb v Provozovně používat vlastní platební terminál. Příjemce se v takovém případě zavazuje reportovat veškeré bezhotovostní transakce Poskytovateli, a to správně, úplně a v termínu dle odst. 7. V případě, že Příjemce poruší svou povinnost reportovat bezhotovostní transakce správně, úplně nebo v termínu, zavazuje se uhradit Poskytovateli smluvní pokutu ve výši <strong>400 000 Kč</strong> za každý jednotlivý případ porušení.</li>
      <li><strong>Varianta B — Platební terminál Poskytovatele:</strong> Příjemce se zavazuje k inkasu bezhotovostních tržeb Provozovny používat v Provozovně platební terminál určený Poskytovatelem (dále jen „<strong>Terminál Poskytovatele</strong>“). Bezhotovostní platby přijaté prostřednictvím Terminálu Poskytovatele jsou připisovány na účet Poskytovatele a okamžikem jejich připsání se stávají součástí peněžních prostředků, s nimiž je Poskytovatel oprávněn nakládat vlastním jménem, na vlastní účet a bez povinnosti jejich oddělené správy. Smluvní strany výslovně sjednávají, že Příjemci ve vztahu k takto přijatým platbám nevzniká vlastnické právo ani jiný nárok, nýbrž pouze pohledávka Příjemce za Poskytovatelem splatná dle odst. 7 tohoto článku (dále jen „<strong>Pohledávka Příjemce na vypořádání</strong>“).</li>
    </ol>
  </li>
  <li>Finanční vypořádání a reporting probíhá v návaznosti na zvolenou variantu dle odst. 6 následovně:
    <ol>
      <li><em>V případě Varianty A:</em> Příjemce je povinen předkládat Poskytovateli měsíční přehledy bezhotovostních tržeb nejpozději do <strong>5. dne</strong> následujícího kalendářního měsíce, nedohodnou-li se strany jinak.</li>
      <li><em>V případě Varianty B:</em> Poskytovatel provádí měsíční vyúčtování bezhotovostních tržeb z Terminálu Poskytovatele a úhradu splatných pohledávek Poskytovatele vůči Příjemci z těchto prostředků prostřednictvím započtení, k čemuž Smluvní strany tímto udělují souhlas, a to nejpozději do <strong>22. dne</strong> kalendářního měsíce následujícího po měsíci, za který se vyúčtování provádí. Rozdíl (zbývající část Pohledávky Příjemce na vypořádání po započtení) ve prospěch Příjemce Poskytovatel poukáže na bankovní účet Příjemce, a to do 22. dne kalendářního měsíce následujícího po měsíci, za který se vyúčtování provádí.</li>
    </ol>
  </li>
  <li>Poskytovatel se zavazuje, že po dobu trvání této Smlouvy nebude v místě sjednaném v čl. I odst. 2 této Smlouvy ani v okruhu <strong>500 m</strong> od něj provozovat vlastní provozovnu Konceptu ani jinou provozovnu, která by mohla být v konkurenčním postavení k Provozovně provozované Příjemcem, ani v tomto území neumožní provoz provozovny Konceptu jinému franšízantovi.</li>
  <li>Příjemce se zavazuje zachovávat mlčenlivost ohledně důvěrných informací (včetně neveřejných finančních výsledků Poskytovatele), které mu Poskytovatel předal v rámci této Smlouvy, a nesmí se mediálně ani jinak vyjadřovat k aspektům spolupráce s Poskytovatelem. Tato povinnost trvá nejdéle <strong>10 let</strong> od ukončení této Smlouvy. Za každý jednotlivý případ porušení uhradí porušitel Poskytovateli smluvní pokutu <strong>500 000 Kč</strong>, splatnou do 7 dnů od výzvy.</li>
</ol>

<h2>VIII. Sankce a ukončení Smlouvy</h2>
<ol>
  <li>Tato Smlouva je uzavřena na dobu určitou, a to <strong>10 let</strong> od uzavření této Smlouvy. Poskytovatel se zavazuje s Příjemcem před uplynutím této doby jednat o nové franšízingové smlouvě, která nebude obsahovat pro Příjemce méně výhodná ustanovení, než jaká budou v té době nabízena dalším franšízantům.</li>
  <li>Poskytovatel je oprávněn tuto Smlouvu vypovědět s výpovědní dobou 1 týden, která počíná běžet dnem doručení písemné výpovědi druhé Smluvní straně, pokud Příjemce:
    <ol>
      <li>vstoupí do likvidace nebo s ním bude zahájeno insolvenční řízení,</li>
      <li>bude jako dlužník v exekuci,</li>
      <li>bude v prodlení s úhradou kteréhokoliv z poplatků dle této Smlouvy o více než 14 dnů,</li>
      <li>změní vzhled a označení Provozovny oproti podmínkám této Smlouvy a/nebo pokynům Poskytovatele a nezjedná nápravu ani ve lhůtě 7 dnů od výzvy Poskytovatele,</li>
      <li>bude v prodlení s převzetím Provozovny a Provozovnu nepřevezme ani v dodatečné lhůtě 7 dnů od výzvy Poskytovatele,</li>
      <li>nebude plnit povinnosti vyplývající z dalších smluv uzavřených mezi Poskytovatelem a Příjemcem zároveň s touto Smlouvou,</li>
      <li>poruší své závazky nekonkurovat franšízingové síti Konceptu dle čl. III. odst. 6 této Smlouvy,</li>
      <li>poruší jiný svůj závazek dle této Smlouvy a nezjedná nápravu ani ve lhůtě 7 dnů od výzvy Poskytovatele.</li>
    </ol>
  </li>
  <li>Výpověď se má za doručenou 3. pracovní den ode dne odeslání doporučenou poštou na adresu Smluvní strany v záhlaví, do datové schránky Příjemce nebo na korespondenční adresu, pokud nebude doručena dříve.</li>
  <li>Pro případ prodlení s úhradou dlužné částky se Příjemce zavazuje platit Poskytovateli od prvního dne prodlení úroky z prodlení ve výši <strong>0,1 %</strong> z dlužné částky za každý započatý den prodlení.</li>
  <li>Pro případ porušení závazku dle čl. III. odst. 6 této Smlouvy se Příjemce zavazuje zaplatit Poskytovateli smluvní pokutu ve výši <strong>5 000 000 Kč</strong> a dále nahradit vzniklou újmu v celém rozsahu.</li>
  <li>Pokud by se Příjemce rozhodl vybavení a práva provozovat Provozovnu vyplývající z této Smlouvy prodat, může tak učinit sám a Poskytovatel se k tomu zavazuje poskytnout souhlas, nebo osloví Poskytovatele, který Provozovnu bezprostředně zařadí do své nabídky společně s dalšími franšízingovými provozovnami v nabídce Poskytovatele.</li>
  <li>Sjednáním či zaplacením kterékoli smluvní pokuty sjednané v této Smlouvě není dotčeno právo Poskytovatele na náhradu škody v plném rozsahu, a to i v rozsahu převyšujícím sjednanou smluvní pokutu. Není-li sjednáno jinak, je jakákoliv smluvní pokuta sjednaná dle této Smlouvy splatná do 7 dnů od výzvy.</li>
</ol>

<h2>IX. Závěrečná ustanovení</h2>
<ol>
  <li>Tato Smlouva nabývá platnosti a účinnosti dnem jejího podpisu oběma účastníky.</li>
  <li>Pro vyloučení všech pochybností Smluvní strany výslovně potvrzují, že jsou podnikateli, uzavírají tuto Smlouvu při svém podnikání, a na tuto Smlouvu se tudíž neuplatní ustanovení § 1793 zákona č. 89/2012 Sb., občanský zákoník, ve znění pozdějších předpisů.</li>
  <li>Tuto Smlouvu lze měnit a doplňovat pouze písemnou formou vzestupně číslovaných dodatků podepsaných oběma Smluvními stranami.</li>
  <li>Je-li některé ustanovení této Smlouvy neplatné nebo neúčinné, ostatní zůstávají platná. Smluvní strany se zavazují nahradit takové ustanovení novým, které nejlépe odpovídá původnímu účelu.</li>
  <li>Poskytovatel je oprávněn tuto Smlouvu i bez souhlasu Příjemce zčásti či zcela postoupit, přičemž postoupením se osvobozuje od svých povinností v rozsahu postoupení; Smluvní strany výslovně vylučují aplikaci ustanovení § 1899 zákona č. 89/2012 Sb., občanský zákoník, ve znění pozdějších předpisů.</li>
  <li>Příjemce není oprávněn své pohledávky za Poskytovatelem z této Smlouvy postoupit na třetí osobu bez souhlasu Poskytovatele.</li>
</ol>

<h2>Podpisy</h2>
<p>V {{place}} dne {{contractDate}}.</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{providerStatutory1Name}}</strong><br/>{{providerStatutory1Role}}<br/>za Poskytovatele: {{providerName}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{providerStatutory2Name}}</strong><br/>{{providerStatutory2Role}}<br/>za Poskytovatele: {{providerName}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{clientSignerName}}</strong><br/>{{clientSignerRole}}<br/>za Příjemce: {{clientName}}</p>`;
}

/* -------------------------------------------------------------------------
 * Odstoupení od smluv — varianta A (porušení na straně Manažera)
 * Odesílatel (klient/franšízant) odstupuje od MS (Smlouva o provozování),
 * sekundárně padá FS (Franšízingová). Nakládání s KS řízeno {{ksDropClause}}
 * a {{ksPreservedClause}} placeholdery (KS padá / KS zůstává v platnosti).
 * ------------------------------------------------------------------------- */
function withdrawalAHtml(): string {
  return `<h1>Odstoupení od smlouvy</h1>
<p><em>Smlouva o provozování provozovny a Franšízingová smlouva</em></p>

<h2>Smluvní strany</h2>
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}{{clientRepresentationClause}} (dále jen „<strong>Odesílatel</strong>“)</p>
<p><strong>{{managerName}}</strong>, IČO: {{managerIco}}, se sídlem {{managerStreet}}, {{managerZip}} {{managerCity}} (dále jen „<strong>Manažer</strong>“)</p>
<p><strong>{{providerName}}</strong>, IČO: {{providerIco}}, se sídlem {{providerStreet}}, {{providerZip}} {{providerCity}} (dále jen „<strong>Poskytovatel</strong>“)</p>

<h2>Úvodní ustanovení</h2>
<ol>
  <li>Mezi Smluvními stranami byly dne <strong>{{originContractsDate}}</strong> uzavřeny při témže jednání následující smlouvy, jejichž předmětem je lokace <strong>{{withdrawalLocation}}</strong>:
    <ol>
      <li><strong>Smlouva o provozování provozovny</strong> mezi Odesílatelem a Manažerem (dále jen „<strong>MS</strong>“);</li>
      <li><strong>Franšízingová smlouva</strong> mezi Odesílatelem a Poskytovatelem (dále jen „<strong>FS</strong>“);</li>
      <li><strong>Kupní smlouva k vybavení</strong> mezi Odesílatelem a Manažerem (dále jen „<strong>KS</strong>“).</li>
    </ol>
  </li>
  <li>Smlouvy tvoří <strong>jediný hospodářský celek</strong> a jsou ve smyslu <strong>§ 1727 občanského zákoníku</strong> smlouvami závislými.</li>
</ol>

<h2>Odstoupení</h2>
<ol>
  <li>Manažer trvale porušuje svou základní povinnost dodávat měsíční PNL reporty za Provozovnu od počátku franšízového vztahu. Jde o esenciální povinnost Manažera podle MS, bez níž nelze ověřit hospodářský výsledek Provozovny ani vypořádat ekonomické vztahy podle Smluv.</li>
  <li>Popsané jednání je <strong>podstatným porušením</strong> smluvní povinnosti ve smyslu § 2002 odst. 1 občanského zákoníku — Odesílatel by Smlouvy neuzavřel, pokud by takový stav v době uzavření Smluv předvídal.</li>
  <li><strong>Odesílatel tímto odstupuje od Smlouvy o provozování provozovny (MS)</strong> dle <strong>§ 2002 odst. 1 občanského zákoníku</strong>. Odstoupení je účinné okamžikem doručení tohoto projevu vůle (§ 570 odst. 1 OZ).</li>
  <li>Zároveň podle <strong>§ 1727 občanského zákoníku</strong> dochází k zániku též <strong>Franšízingové smlouvy (FS)</strong>{{ksDropClause}} jako smluv závislých.</li>
  {{ksPreservedClause}}
  <li>Pohledávky vzniklé před odstoupením (úroky z prodlení, smluvní pokuty) zůstávají zachovány (§ 2005 odst. 1 OZ). Odesílatel si vyhrazuje veškeré další nároky.</li>
</ol>

<p><em>Toto Odstoupení je výhradně civilní povahy a žádná z výzev ani požadavků v něm obsažených není vázána na hrozbu trestního oznámení.</em></p>

<p>V {{place}} dne {{contractDate}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{clientName}}</strong><br/>{{clientSignerName}}, {{clientSignerRole}}</p>`;
}

/* -------------------------------------------------------------------------
 * Odstoupení od smluv — varianta B (porušení na straně Poskytovatele)
 * Odesílatel (klient/franšízant) odstupuje od FS (Franšízingová), sekundárně
 * padá MS. Nakládání s KS řízeno stejně jako u varianty A.
 * ------------------------------------------------------------------------- */
function withdrawalBHtml(): string {
  return `<h1>Odstoupení od smlouvy</h1>
<p><em>Smlouva o provozování provozovny a Franšízingová smlouva</em></p>

<h2>Smluvní strany</h2>
<p><strong>{{clientName}}</strong>, IČO: {{clientIco}}, se sídlem {{clientStreet}}, {{clientZip}} {{clientCity}}{{clientRepresentationClause}} (dále jen „<strong>Odesílatel</strong>“)</p>
<p><strong>{{managerName}}</strong>, IČO: {{managerIco}}, se sídlem {{managerStreet}}, {{managerZip}} {{managerCity}} (dále jen „<strong>Manažer</strong>“)</p>
<p><strong>{{providerName}}</strong>, IČO: {{providerIco}}, se sídlem {{providerStreet}}, {{providerZip}} {{providerCity}} (dále jen „<strong>Poskytovatel</strong>“)</p>

<h2>Úvodní ustanovení</h2>
<ol>
  <li>Mezi Smluvními stranami byly dne <strong>{{originContractsDate}}</strong> uzavřeny při témže jednání následující smlouvy, jejichž předmětem je lokace <strong>{{withdrawalLocation}}</strong>:
    <ol>
      <li><strong>Smlouva o provozování provozovny</strong> mezi Odesílatelem a Manažerem (dále jen „<strong>MS</strong>“);</li>
      <li><strong>Franšízingová smlouva</strong> mezi Odesílatelem a Poskytovatelem (dále jen „<strong>FS</strong>“);</li>
      <li><strong>Kupní smlouva k vybavení</strong> mezi Odesílatelem a Manažerem (dále jen „<strong>KS</strong>“).</li>
    </ol>
  </li>
  <li>Smlouvy tvoří <strong>jediný hospodářský celek</strong> a jsou ve smyslu <strong>§ 1727 občanského zákoníku</strong> smlouvami závislými.</li>
</ol>

<h2>Odstoupení</h2>
<ol>
  <li>Poskytovatel dne <strong>{{leaseLostDate}}</strong> pozbyl právní titul, na jehož základě byl povinen přenechat Odesílateli prostory Provozovny do podnájmu podle FS, a v přiměřené době nezajistil náhradní prostory ani jiné rovnocenné plnění. Bez zajištěného provozního prostoru pozbývá FS svého hospodářského účelu.</li>
  <li>Popsané jednání je <strong>podstatným porušením</strong> smluvní povinnosti ve smyslu § 2002 odst. 1 občanského zákoníku — Odesílatel by Smlouvy neuzavřel, pokud by takový stav v době uzavření Smluv předvídal.</li>
  <li><strong>Odesílatel tímto odstupuje od Franšízingové smlouvy (FS)</strong> dle <strong>§ 2002 odst. 1 občanského zákoníku</strong>. Odstoupení je účinné okamžikem doručení tohoto projevu vůle (§ 570 odst. 1 OZ).</li>
  <li>Zároveň podle <strong>§ 1727 občanského zákoníku</strong> dochází k zániku též <strong>Smlouvy o provozování provozovny (MS)</strong>{{ksDropClause}} jako smluv závislých.</li>
  {{ksPreservedClause}}
  <li>Pohledávky vzniklé před odstoupením (úroky z prodlení, smluvní pokuty) zůstávají zachovány (§ 2005 odst. 1 OZ). Odesílatel si vyhrazuje veškeré další nároky.</li>
</ol>

<p><em>Toto Odstoupení je výhradně civilní povahy a žádná z výzev ani požadavků v něm obsažených není vázána na hrozbu trestního oznámení.</em></p>

<p>V {{place}} dne {{contractDate}}</p>
<p>&nbsp;</p>
<p>__________________________<br/><strong>{{clientName}}</strong><br/>{{clientSignerName}}, {{clientSignerRole}}</p>`;
}

export function buildDefaultHtml(
  type: ContractType,
  variant?: ContractVariant,
): string {
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
    case "franchise": {
      const v = variant ?? DEFAULT_FRANCHISE_VARIANT;
      return v === "AB" ? franchiseAbHtml() : franchiseBHtml();
    }
    case "withdrawal": {
      const v = variant ?? DEFAULT_WITHDRAWAL_VARIANT;
      return v === "B" ? withdrawalBHtml() : withdrawalAHtml();
    }
    default:
      return genericSkeleton(type);
  }
}
