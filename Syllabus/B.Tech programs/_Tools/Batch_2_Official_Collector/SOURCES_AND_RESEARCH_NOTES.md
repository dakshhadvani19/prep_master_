# Source inventory and research notes

Checked: 10 October 2026

## Official Marwadi sources used to define the collection

- B.Tech programs page: https://www.marwadiuniversity.ac.in/b-tech-engineering-colleges-in-gujarat/
- Marwadi University prospectus (2025): https://www.marwadiuniversity.ac.in/wp-content/uploads/2025/05/MU_Prospectus_2025.pdf
- Computer Engineering: https://www.marwadiuniversity.ac.in/btech-in-computer-engineering/
- Computer Science and Engineering: https://www.marwadiuniversity.ac.in/btech-in-computer-science-engineering/
- CSE Artificial Intelligence: https://www.marwadiuniversity.ac.in/btech-cse-artificial-intelligence/
- CSE Artificial Intelligence and Data Science: https://www.marwadiuniversity.ac.in/btech-cse-artificial-intelligence-data-science/
- CSE Artificial Intelligence and Machine Learning: https://www.marwadiuniversity.ac.in/btech-cse-artificial-intelligence-machine-learning/
- CSE Cyber Security: https://www.marwadiuniversity.ac.in/btech-computer-science-and-engineering-cyber-security/
- Information and Communication Technology: https://www.marwadiuniversity.ac.in/information-communication-technology-engineering-b-tech-ict/
- Information Technology: https://www.marwadiuniversity.ac.in/btech-in-information-technology-colleges/
- Electronics and Communication Engineering: https://www.marwadiuniversity.ac.in/electronics-and-communication-engineering-btech/
- ECE AI/ML: https://www.marwadiuniversity.ac.in/electronics-and-communication-engineering-ai-mlbtech/
- ECE VLSI: https://www.marwadiuniversity.ac.in/electronics-and-communication-engineering-vlsi-btech/
- Bioinformatics: https://www.marwadiuniversity.ac.in/btech-bioinformatics-colleges/
- Chemical Engineering: https://www.marwadiuniversity.ac.in/btech-chemical-engineering-colleges/
- Civil Engineering: https://www.marwadiuniversity.ac.in/btech-civil-engineering-colleges/
- Electrical Engineering: https://www.marwadiuniversity.ac.in/b-tech-in-electrical-engineering-fees/
- Mechanical Engineering: https://www.marwadiuniversity.ac.in/b-tech-mechanical-engineering-fees/
- Mechanical Robotics and Automation: https://www.marwadiuniversity.ac.in/mechanical-engineering-robotics-automation/
- Mechanical AI/ML: https://www.marwadiuniversity.ac.in/mechanical-ai-ml/

The official program directory and the 2025 prospectus do not show exactly the same set of variants. The prospectus includes ECE Robotics and ECE Internet of Things, but this research pass did not confirm separate current program pages for them. These are included in `programs.csv` with a historical/prospectus-only status instead of being silently assumed current.

## PDF link pattern observed

The current Computer Engineering page links individual subjects such as Calculus (01MA0106) to a direct PDF URL under the university's uploads folder. The browser's page extraction exposed a URL in this form:

https://www.marwadiuniversity.ac.in/wp-content/uploads/2026/06/01MA0106.pdf

The exact folder and PDF file naming can change. The collector therefore reads the live page and follows its current direct links instead of assuming a hard-coded year/path pattern.

Some indexed official course-PDF pages expose fields such as program, semester, course title and course code in the PDF itself. The collector uses PDF metadata where available and does not infer semester from the digits in a course code.

## GTU fallback

GTU is the only configured external fallback. Official GTU source portal: https://www.gtu.ac.in/

Example official GTU Data Structures syllabus URL discovered during research: https://gtu.ac.in/syllabus/NEW%20BE/Sem3/2130702.pdf

This example is included as evidence that GTU publishes direct semester syllabus PDFs; it is **not** mapped as a replacement for a particular Marwadi course. Each missing Marwadi syllabus still needs a deliberate topic-level match before any GTU PDF is added to `GTU_Fallback_Map.csv`.

## Important execution limitation

The research browser can inspect pages and locate PDF links, but the current container cannot retrieve the actual PDF binary files from the public website. Therefore this ZIP is not represented as a completed archive of syllabus content. The runnable collection script is included so the original linked PDFs can be downloaded on a machine with ordinary internet access.
