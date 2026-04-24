import { collection, doc, getDocs, query, setDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const papers = [
  { year: 1998, title: "AIPMT 1998 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 1999, title: "AIPMT 1999 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2000, title: "AIPMT 2000 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2001, title: "AIPMT 2001 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2002, title: "AIPMT 2002 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2003, title: "AIPMT 2003 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2004, title: "AIPMT 2004 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2005, title: "AIPMT 2005 (CBSE) Prelims", subject: "Physics, Chemistry, Biology" },
  { year: 2006, title: "AIPMT 2006 (CBSE) Full Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2007, title: "CBSE PMT 2007 Screening", subject: "Physics, Chemistry, Biology" },
  { year: 2008, title: "AIPMT 2008 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2010, title: "AIPMT 2010 Pre-Dental Exam", subject: "Physics, Chemistry, Biology" },
  { year: 2011, title: "AIPMT 2011 Prelims", subject: "Physics, Chemistry, Biology" },
  { year: 2012, title: "AIPMT 2012 Prelims", subject: "Physics, Chemistry, Biology" },
  { year: 2013, title: "NEET 2013 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2014, title: "AIPMT 2014 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2015, title: "AIPMT 2015 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2016, title: "NEET 2016 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2017, title: "NEET 2017 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2018, title: "NEET 2018 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2019, title: "NEET 2019 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2020, title: "NEET 2020 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2021, title: "NEET 2021 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2022, title: "NEET 2022 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2023, title: "NEET 2023 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2024, title: "NEET 2024 Official Paper", subject: "Physics, Chemistry, Biology" },
  { year: 2025, title: "NEET 2025 Official Paper", subject: "Physics, Chemistry, Biology" }
];

export async function seedOfficialPapers() {
  console.log("Starting seeding of official papers...");
  let successCount = 0;
  let failCount = 0;

  for (const paper of papers) {
    const paperId = `official-${paper.year}`;
    const paperRef = doc(db, 'officialPapers', paperId);
    
    try {
      await setDoc(paperRef, {
        ...paper,
        pdfUrl: "#", 
        description: `Official ${paper.year} examination paper for NEET/AIPMT aspirants.`,
        updatedAt: serverTimestamp()
      }, { merge: true });
      successCount++;
    } catch (e) {
      console.error(`Error seeding paper ${paper.year}:`, e);
      failCount++;
    }
  }
  
  if (failCount > 0) {
    alert(`Seeding partial: ${successCount} successful, ${failCount} failed. Check console for details.`);
  } else {
    alert("Full archive initialized successfully!");
  }

  // Seed sample ACTIVE set for 1998
  try {
    const setRef = doc(db, 'mcqSets', 'official-1998-active');
    await setDoc(setRef, {
      userId: "system",
      isOfficial: true,
      officialYear: 1998,
      sourceFileName: "AIPMT-1998.pdf",
      topic: "AIPMT 1998 Full Paper",
      createdAt: serverTimestamp(),
      questions: [
        {
          question: "Boron has two isotopes 5B10 and 5B11. If atomic weight of Boron is 10.81 then ratio of 5B10 to 5B11 in nature will be :",
          options: ["15 : 16", "19 : 81", "81 : 19", "20 : 53"],
          correctAnswer: "19 : 81",
          explanation: "Based on weighted average formula: 10.81 = (10x + 11(100-x))/100. Solving gives x=19.",
          difficulty: "NEET level",
          concept: "Isotopes and Atomic weight"
        },
        {
          question: "A hollow sphere of radius 1m is given a positive charge of 10µC. The electric field at the centre of hollow sphere will be :",
          options: ["60 × 10³ Vm⁻¹", "90 × 10³ Vm⁻¹", "Zero", "Infinite"],
          correctAnswer: "Zero",
          explanation: "Electric field inside a charged hollow conductor is always zero.",
          difficulty: "NEET level",
          concept: "Electrostatics"
        },
        {
          question: "A circular ring of mass M and radius R is rotating about its axis with constant angular velocity ω. Two particle each of mass m are attached gently to the opposite ends of a diameter of the ring. The angular velocity of the ring will now become :",
          options: ["(Mω)/(M + 2m)", "(Mω)/(M - 2m)", "((M + 2m)ω)/M", "M/(M + 2m)"],
          correctAnswer: "(Mω)/(M + 2m)",
          explanation: "By conservation of angular momentum: I₁ω₁ = I₂ω₂. (MR²)ω = (MR² + 2mR²)ω'. Solving gives ω' = Mω/(M + 2m).",
          difficulty: "NEET level",
          concept: "Rotational Dynamics"
        }
      ]
    }, { merge: true });
    console.log("Seeded active set for 1998");
  } catch (e) {
    console.error("Error seeding active set:", e);
  }

  // Seed sample ACTIVE set for 2022
  try {
    const setRef = doc(db, 'mcqSets', 'official-2022-active');
    await setDoc(setRef, {
      userId: "system",
      isOfficial: true,
      officialYear: 2022,
      sourceFileName: "NEET-2022.pdf",
      topic: "NEET 2022 (Official Phase)",
      createdAt: serverTimestamp(),
      questions: [
        {
          question: "Which of the following is correct regarding the role of Manganese in green plants?",
          options: ["Photolysis of water", "Calvin cycle", "Nitrogen fixation", "Water absorption"],
          correctAnswer: "Photolysis of water",
          explanation: "Manganese is essential for the oxygen-evolving complex in PSII, where it helps in the photolysis of water.",
          difficulty: "NEET level",
          concept: "Mineral Nutrition"
        },
        {
          question: "Identify the correct sequence of spermatogenetic stages leading to the formation of sperms in a mature human testis:",
          options: [
            "Spermatogonia - Spermatocyte - Spermatid - Sperms",
            "Spermatid - Spermatocyte - Spermatogonia - Sperms",
            "Spermatogonia - Spermatid - Spermatocyte - Sperms",
            "Spermatocyte - Spermatogonia - Spermatid - Sperms"
          ],
          correctAnswer: "Spermatogonia - Spermatocyte - Spermatid - Sperms",
          explanation: "The process begins with spermatogonia, which divide into primary and secondary spermatocytes, then transform into spermatids, and finally mature into spermatozoa (sperms).",
          difficulty: "NEET level",
          concept: "Human Reproduction"
        }
      ]
    }, { merge: true });
    console.log("Seeded active set for 2022");
  } catch (e) {
    console.error("Error seeding active set:", e);
  }

  console.log("Seeding complete.");
}
