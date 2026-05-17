import { CONTRACT_TYPE_META, type ContractType } from "./contract-types";

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* -------------------------------------------------------------------------
 * Generic skeleton (původní default) — použito pro typy, které ještě
 * nemají specifickou šablonu (franchise, cooperation, operation).
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
    default:
      return genericSkeleton(type);
  }
}
