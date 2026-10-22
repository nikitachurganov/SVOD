"""Bibliography used in the methodology summary / report.

Foreign works are cited in the original language (GOST R 7.0.100 style). Entries with
``verified=False`` come from the product brief and must be checked against the actual
edition (publisher, year, translation title) before they are relied upon.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Source:
    key: str
    citation: str
    kind: str = "book"  # book | article | standard | web
    verified: bool = True


_SOURCES = [
    Source(
        "kotler_keller",
        "Kotler P., Keller K. L. Marketing Management. 15th ed. Harlow: Pearson, 2016.",
    ),
    Source(
        "ries_lean_startup",
        "Ries E. The Lean Startup: How Today's Entrepreneurs Use Continuous Innovation to Create "
        "Radically Successful Businesses. New York: Crown Business, 2011.",
    ),
    Source(
        "green_srinivasan",
        "Green P. E., Srinivasan V. Conjoint analysis in consumer research: issues and outlook // "
        "Journal of Consumer Research. 1978. Vol. 5, № 2. P. 103–123.",
        kind="article",
    ),
    Source(
        "mitchell_vals",
        "Mitchell A. The Nine American Lifestyles: Who We Are and Where We're Going. "
        "New York: Macmillan, 1983.",
    ),
    Source(
        "ohno_tps",
        "Ohno T. Toyota Production System: Beyond Large-Scale Production. Portland: Productivity "
        "Press, 1988.",
    ),
    Source(
        "iso_20252",
        "ГОСТ Р ИСО 20252. Исследование рынка, социальные и маркетинговые исследования, "
        "исследование общественного мнения. Словарь и требования к услугам "
        "(идентичен ISO 20252). Год и редакцию уточнить по действующему изданию.",
        kind="standard",
        verified=False,
    ),
    Source(
        "likert_1932",
        "Likert R. A technique for the measurement of attitudes // Archives of Psychology. "
        "1932. № 140. P. 1–55.",
        kind="article",
    ),
    Source(
        "osgood_1957",
        "Osgood C. E., Suci G. J., Tannenbaum P. H. The Measurement of Meaning. "
        "Urbana: University of Illinois Press, 1957.",
    ),
    Source(
        "willis_2005",
        "Willis G. B. Cognitive Interviewing: A Tool for Improving Questionnaire Design. "
        "Thousand Oaks: Sage, 2005.",
    ),
    Source(
        "oppenheimer_2009",
        "Oppenheimer D. M., Meyvis T., Davidenko N. Instructional manipulation checks: detecting "
        "satisficing to increase statistical power // Journal of Experimental Social Psychology. "
        "2009. Vol. 45, № 4. P. 867–872.",
        kind="article",
    ),
    Source(
        "yadov",
        "Ядов В. А. Стратегия социологического исследования. Описание, объяснение, понимание "
        "социальной реальности. Издание, год и издательство уточнить по экземпляру.",
        verified=False,
    ),
    Source(
        "babbie",
        "Babbie E. The Practice of Social Research. Boston: Cengage Learning "
        "(русское издание: Бэбби Э. Практика социального исследования — название и выходные "
        "данные перевода уточнить).",
        verified=False,
    ),
    Source(
        "gost_59128",
        "ГОСТ Р 59128-2020. Номер, название и статус стандарта уточнить по официальному "
        "реестру (ГОСТ Р, Росстандарт) перед использованием в работе.",
        kind="standard",
        verified=False,
    ),
    Source(
        "fitzpatrick_mom_test",
        "Fitzpatrick R. The Mom Test: How to Talk to Customers and Learn If Your Business Is a "
        "Good Idea When Everyone Is Lying to You. CreateSpace, 2013.",
    ),
    Source(
        "christensen_jtbd",
        "Christensen C. M., Hall T., Dillon K., Duncan D. S. Competing Against Luck: The Story of "
        "Innovation and Customer Choice. New York: Harper Business, 2016.",
    ),
    Source(
        "maurya_running_lean",
        "Maurya A. Running Lean: Iterate from Plan A to a Plan That Works. 2nd ed. "
        "Sebastopol: O'Reilly Media, 2012.",
    ),
    Source(
        "blank_four_steps",
        "Blank S. The Four Steps to the Epiphany. K&S Ranch, 2005.",
    ),
    Source(
        "reichheld_2003",
        "Reichheld F. F. The one number you need to grow // Harvard Business Review. 2003. "
        "Vol. 81, № 12. P. 46–54.",
        kind="article",
    ),
    Source(
        "reichheld_ultimate_question",
        "Reichheld F. F., Markey R. The Ultimate Question 2.0: How Net Promoter Companies Thrive "
        "in a Customer-Driven World. Boston: Harvard Business Review Press, 2011.",
    ),
    Source(
        "oliver_1980",
        "Oliver R. L. A cognitive model of the antecedents and consequences of satisfaction "
        "decisions // Journal of Marketing Research. 1980. Vol. 17, № 4. P. 460–469.",
        kind="article",
    ),
    Source(
        "dixon_effortless",
        "Dixon M., Toman N., DeLisi R. The Effortless Experience: Conquering the New Battleground "
        "for Customer Loyalty. New York: Portfolio / Penguin, 2013.",
    ),
    Source(
        "brooke_sus",
        "Brooke J. SUS: a \"quick and dirty\" usability scale // Usability Evaluation in "
        "Industry / ed. by P. W. Jordan et al. London: Taylor & Francis, 1996. P. 189–194.",
    ),
    Source(
        "laugwitz_ueq",
        "Laugwitz B., Held T., Schrepp M. Construction and evaluation of a user experience "
        "questionnaire // HCI and Usability for Education and Work (USAB 2008). Lecture Notes in "
        "Computer Science. Vol. 5298. Berlin: Springer, 2008. P. 63–76.",
        kind="article",
    ),
    Source(
        "krug_dmmt",
        "Krug S. Don't Make Me Think, Revisited: A Common Sense Approach to Web Usability. "
        "3rd ed. Berkeley: New Riders, 2014.",
    ),
    Source(
        "nielsen_heuristics",
        "Nielsen J. 10 Usability Heuristics for User Interface Design [Electronic resource] // "
        "Nielsen Norman Group. URL: https://www.nngroup.com/articles/ten-usability-heuristics/ "
        "(access date: указать дату обращения).",
        kind="web",
    ),
]

SOURCES: dict[str, Source] = {s.key: s for s in _SOURCES}


def get_sources(keys: list[str]) -> list[Source]:
    return [SOURCES[k] for k in keys if k in SOURCES]
