// Rotating message templates for Rollkarte requests and thank-yous.
// Selection is based on day-of-year so it changes daily but is consistent within a day.

const requestTemplates = [
  (name: string, customer: string) =>
    `Guten Morgen ${name}! 🚛\n\nFür deine heutige Tour zu ${customer} brauchen wir noch die Rollkartennummer.\n\nBitte schick sie uns einfach als Antwort, z.B.:\nRollkarte 12345\n\nVielen Dank und gute Fahrt! 👍`,

  (name: string, customer: string) =>
    `Hallo ${name}! 👋\n\nKurze Frage zu deiner Tour heute bei ${customer}: Hast du schon die Rollkartennummer?\n\nSchick sie uns einfach zurück, z.B.:\n12345\n\nDanke dir und viel Erfolg heute!`,

  (name: string, customer: string) =>
    `Moin ${name}! ☀️\n\nWir benötigen noch die Rollkartennummer für deine heutige Fahrt zu ${customer}.\n\nEinfach antworten mit der Nummer, z.B.:\nRollkarte 12345\n\nHaben einen guten Tag! 🙌`,

  (name: string, customer: string) =>
    `Hey ${name}, guten Morgen! 🌤️\n\nBevor du loslegst: Kannst du uns die Rollkartennummer für ${customer} zukommen lassen?\n\nEinfach hier antworten:\n12345\n\nDanke und pass auf dich auf!`,

  (name: string, customer: string) =>
    `Guten Morgen ${name}! 🚚\n\nFür die heutige Tour zu ${customer} fehlt uns noch die Rollkartennummer.\n\nBitte kurz antworten mit:\nRollkarte 12345\n\nWir wünschen dir eine reibungslose Tour! ✅`,

  (name: string, customer: string) =>
    `Hi ${name}! 👌\n\nKleine Erinnerung: Für deine Tour heute bei ${customer} wird noch die Rollkartennummer gebraucht.\n\nEinfach per Antwort schicken:\n12345\n\nDanke und gute Fahrt!`,

  (name: string, customer: string) =>
    `Hallo ${name}, guten Morgen! ☕\n\nWir brauchen noch die Rollkartennummer für ${customer} heute.\n\nEinfach hier antworten, z.B.:\nRollkarte 12345\n\nDankeschön und einen schönen Tag! 😊`,
];

const thankYouTemplates = [
  (name: string, number: string) =>
    `Super, danke ${name}! ✅ Rollkartennummer ${number} wurde gespeichert. Gute Fahrt!`,

  (name: string, number: string) =>
    `Perfekt, danke dir ${name}! 👍 Die ${number} ist eingetragen. Alles Gute für heute!`,

  (name: string, number: string) =>
    `Danke ${name}! 🙌 Rollkarte ${number} ist bei uns angekommen. Schöne Tour!`,

  (name: string, number: string) =>
    `Top, ${name}! ✔️ Nummer ${number} gespeichert. Wir wünschen dir eine gute Fahrt!`,

  (name: string, number: string) =>
    `Vielen Dank ${name}! 😊 Die Rollkartennummer ${number} ist notiert. Bleib sicher unterwegs!`,

  (name: string, number: string) =>
    `Danke ${name}, alles klar! 🚛 Rollkarte ${number} eingetragen. Gutes Gelingen heute!`,

  (name: string, number: string) =>
    `Prima, ${name}! ✅ ${number} ist gespeichert. Dankeschön und gute Fahrt! 👋`,
];

function dayIndex(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000) % 7;
}

export function getRollkarteRequestMessage(firstName: string, customerName: string): string {
  const idx = dayIndex();
  return `🚛 Cargo Köhler\n\n` + requestTemplates[idx](firstName, customerName);
}

export function getRollkarteThankYouMessage(firstName: string, rollkarteNumber: string): string {
  const idx = (dayIndex() + 3) % 7; // offset so it differs from request msg
  return thankYouTemplates[idx](firstName, rollkarteNumber);
}
