# Compiling the User Guide

## Prerequisites

Install a LaTeX distribution:
- **Windows:** [MiKTeX](https://miktex.org/) or [TeX Live](https://tug.org/texlive/)
- **macOS:** [MacTeX](https://tug.org/mactex/)
- **Linux:** `sudo apt install texlive-full` (or equivalent)

Required packages (auto-installed by MiKTeX, included in TeX Live Full):
- `fontawesome5`, `tcolorbox`, `booktabs`, `longtable`, `tabularx`,
  `mdframed`, `hyperref`, `geometry`, `xcolor`, `lmodern`

## Compiling

Run **twice** to resolve cross-references and the table of contents:

```bash
cd user_guide
pdflatex pathogenius_user_guide.tex
pdflatex pathogenius_user_guide.tex
```

Or with `latexmk` (handles multiple passes automatically):

```bash
latexmk -pdf pathogenius_user_guide.tex
```

## Adding Screenshots

1. Place PNG/JPG screenshot files in the `user_guide/figures/` folder.
2. Replace the `\screenshotplaceholder{...}{...}` commands in the `.tex` file
   with actual `\includegraphics` commands, for example:

```latex
\begin{figure}[H]
  \centering
  \includegraphics[width=0.85\textwidth]{figures/login_screen.png}
  \caption{The Pathogenius login screen.}
\end{figure}
```

## Screenshot Placeholders

Each placeholder in the document is named clearly, e.g.:
- `Login Screen` → `figures/login_screen.png`
- `Dashboard Screen` → `figures/dashboard_screen.png`
- `New Analysis Wizard — Step 1` → `figures/wizard_step1.png`
- etc.
