/** Single source of truth for verified college facts. Everything Aria may state as fact lives here. */
export const COLLEGE = {
  name: "City Law College, Lucknow",
  group: "City Group of Colleges",
  affiliation: "University of Lucknow",
  collegeCode: "1238",
  address:
    "Sector 9, Jankipuram Vistar (AKTU–CDRI Road), Lucknow, Uttar Pradesh 226021",
  phone: "+91 81770 01081",
  principalPhone: "+91 93696 38650",
  // TRIAL: Meta test number the Aria bot lives on. At launch, replace with the
  // college's real WABA number (918177001081) once it's onboarded to the API.
  whatsappNumber: "15550957066",
  email: "info@cgclko.com",
  principal: "Dr. Shiv Bahadur Tiwari",
  manager: "Dr. Mamta Srivastava",
  session: "2026–27",
  programmes: {
    ba_llb: {
      label: "BA LL.B (Hons.)",
      years: 5,
      seats: 120,
      eligibility: "10+2 with min. 45% (40% SC/ST)",
      minGeneral: 45,
      minReserved: 40,
      base: "10+2",
    },
    llb: {
      label: "LL.B",
      years: 3,
      seats: 120,
      eligibility: "Graduation with min. 50%",
      minGeneral: 50,
      minReserved: 50,
      base: "graduation",
    },
  },
  facilities:
    "law library, moot court hall, AC computer centre, multi-cuisine cafeteria, hostel & guest house, seminar halls, Training & Placement Cell",
} as const;

export type CourseKey = keyof typeof COLLEGE.programmes; // 'ba_llb' | 'llb'
