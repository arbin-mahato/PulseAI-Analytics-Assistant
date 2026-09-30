"""Trusted chart/report renderer. Model scripts are declarative recipes, never exec'ed."""

import ast, csv, html, json, re, sys
from pathlib import Path

CHARTS = {"bar", "line", "scatter", "histogram", "pie", "box", "heatmap"}


def parse_recipe(source):
    tree = ast.parse(source)
    if len(tree.body) != 2:
        raise ValueError("Use exactly: from tradelab_analysis import run; run({...})")
    imp, call = tree.body
    if (
        not isinstance(imp, ast.ImportFrom)
        or imp.module != "tradelab_analysis"
        or imp.level
        or [(a.name, a.asname) for a in imp.names] != [("run", None)]
    ):
        raise ValueError("Only the tradelab_analysis.run recipe import is allowed.")
    if (
        not isinstance(call, ast.Expr)
        or not isinstance(call.value, ast.Call)
        or not isinstance(call.value.func, ast.Name)
        or call.value.func.id != "run"
        or len(call.value.args) != 1
        or call.value.keywords
    ):
        raise ValueError("Expected run({...}) with one literal recipe.")
    recipe = ast.literal_eval(call.value.args[0])
    if not isinstance(recipe, dict):
        raise ValueError("Recipe must be an object.")
    allowed = {
        "data_file",
        "chart",
        "x",
        "y",
        "title",
        "xlabel",
        "ylabel",
        "color",
        "summary",
        "filename",
    }
    if set(recipe) - allowed:
        raise ValueError("Unknown recipe fields: " + str(set(recipe) - allowed))
    if recipe.get("chart") not in CHARTS:
        raise ValueError("chart must be one of: " + ", ".join(sorted(CHARTS)))
    for key, value in recipe.items():
        if not isinstance(value, str) or len(value) > 2000:
            raise ValueError(
                "Recipe values must be strings shorter than 2000 characters."
            )
    return recipe


def chart(request):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import pandas as pd

    recipe = parse_recipe(Path(request["script"]).read_text())
    path = Path(request["data_file"])
    df = pd.read_csv(path) if path.suffix == ".csv" else pd.read_json(path)
    if df.empty:
        raise ValueError("No rows to chart. Query a populated window first.")
    kind = recipe["chart"]
    x = recipe.get("x")
    y = recipe.get("y")
    title = recipe.get("title", "TradeLab analysis")
    for col in [x, y]:
        if col and col not in df.columns:
            raise ValueError("Column not found: " + col)
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "axes.spines.top": False,
            "axes.spines.right": False,
            "figure.dpi": 120,
            "axes.titleweight": "bold",
        }
    )
    fig, ax = plt.subplots(figsize=(10, 5.8), layout="constrained")
    color = recipe.get("color", "#0C499C")
    if kind in {"bar", "line", "scatter", "pie"} and (not x or not y):
        raise ValueError("x and y are required for this chart.")
    if kind == "bar":
        ax.bar(df[x].astype(str), pd.to_numeric(df[y]), color=color)
        ax.tick_params(axis="x", rotation=35)
    elif kind == "line":
        ax.plot(df[x].astype(str), pd.to_numeric(df[y]), color=color, marker="o")
        ax.tick_params(axis="x", rotation=35)
    elif kind == "scatter":
        ax.scatter(pd.to_numeric(df[x]), pd.to_numeric(df[y]), color=color, alpha=0.75)
    elif kind == "histogram":
        ax.hist(
            pd.to_numeric(df[y or x]), bins=min(20, max(2, len(df) // 2)), color=color
        )
    elif kind == "pie":
        ax.pie(pd.to_numeric(df[y]), labels=df[x].astype(str), autopct="%1.1f%%")
    elif kind == "box":
        ax.boxplot(pd.to_numeric(df[y or x]).dropna())
        ax.set_xticklabels([y or x])
    elif kind == "heatmap":
        import seaborn as sns

        numeric = df.select_dtypes(include="number")
        sns.heatmap(numeric.corr(), annot=True, cmap="Blues", ax=ax)
    ax.set_title(title, pad=16)
    ax.set_xlabel(recipe.get("xlabel", x or ""))
    ax.set_ylabel(recipe.get("ylabel", y or ""))
    fig.text(
        0.99,
        0.01,
        "TradeLab • Synthetic dataset",
        ha="right",
        fontsize=8,
        color="#64748b",
    )
    output = Path(request["output"])
    output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output, dpi=160)
    plt.close(fig)
    return {
        "stdout": f"Chart generated from {len(df)} verified rows.",
        "files": [str(output)],
        "row_count": len(df),
    }


def pdf(request):
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        Image,
    )
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    font = Path(__file__).resolve().parents[1] / "assets/fonts/DejaVuSans.ttf"
    pdfmetrics.registerFont(TTFont("TradeLab", str(font)))
    styles = getSampleStyleSheet()
    for style in styles.byName.values():
        if hasattr(style, "fontSize"):
            style.fontName = "TradeLab"
            style.leading = max(style.fontSize * 1.45, 14)
    styles["BodyText"].spaceAfter = 8
    story = [
        Paragraph("TradeLab Analytics Report", styles["Title"]),
        Paragraph("Synthetic dataset • Amounts in INR", styles["BodyText"]),
        Spacer(1, 12),
    ]
    lines = request["content"].splitlines()
    i = 0

    def text(s):
        return html.escape(s).replace("**", "")

    def add_table(rows):
        width = max(map(len, rows))
        rows = [r + [""] * (width - len(r)) for r in rows]
        table = Table(
            [[Paragraph(text(str(c)), styles["BodyText"]) for c in r] for r in rows],
            colWidths=[480 / width] * width,
            repeatRows=1,
            hAlign="LEFT",
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e7eef8")),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.extend([table, Spacer(1, 12)])

    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [s.strip() for s in lines[i].strip().strip("|").split("|")]
                if not all(set(c) <= set("-: ") for c in cells):
                    rows.append(cells)
                i += 1
            if rows:
                add_table(rows)
            continue
        if line:
            heading = line.startswith("#")
            line = line.lstrip("#").strip() if heading else line
            story.append(
                Paragraph(
                    text(line), styles["Heading2"] if heading else styles["BodyText"]
                )
            )
        else:
            story.append(Spacer(1, 5))
        i += 1
    table_metadata = []

    def display(value, column):
        if value is None:
            return "—"
        if isinstance(value, str) and re.fullmatch(r"-?\d+\.\d+", value):
            value = float(value)
        if isinstance(value, float):
            money = re.search(
                r"volume|pnl|amount|cash|balance|deposit|withdrawal|price|mtm|turnover",
                column,
                re.I,
            )
            ratio = re.search(r"rate|ratio|share|pct|percent|change", column, re.I)
            return f"{value:,.2f}" if money and not ratio else f"{value:.8g}"
        if isinstance(value, int) and not isinstance(value, bool):
            return f"{value:,}"
        return str(value)

    for data_file in request.get("data_files", []):
        source = Path(data_file)
        with source.open(newline="", encoding="utf-8") as stream:
            rows = (
                list(csv.DictReader(stream))
                if source.suffix == ".csv"
                else json.load(stream)
            )
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError("Report data must contain query result records.")
        total = len(rows)
        rows = rows[:200]
        table_metadata.append(
            {"rows": len(rows), "total_rows": total, "complete": total <= 200}
        )
        story.append(Paragraph("Verified query results", styles["Heading2"]))
        if not rows:
            story.append(Paragraph("The query returned no rows.", styles["BodyText"]))
            continue
        columns = list(rows[0])
        # Split wide results into readable groups; retain the row number across groups.
        for offset in range(0, len(columns), 6):
            group = columns[offset : offset + 6]
            table = [["Row"] + group] + [
                [str(i + 1)] + [display(row.get(c), c) for c in group]
                for i, row in enumerate(rows)
            ]
            add_table(table)
        if total > len(rows):
            story.append(
                Paragraph(
                    f"Showing {len(rows)} of {total} rows. The CSV/JSON download contains the complete query result.",
                    styles["BodyText"],
                )
            )
        story.append(
            Paragraph(
                "Values come directly from the saved query result. Monetary values are rounded for display; rate fields retain their query units.",
                styles["BodyText"],
            )
        )

    for image in request.get("images", []):
        from reportlab.lib.utils import ImageReader

        w, h = ImageReader(image).getSize()
        story.extend(
            [
                Spacer(1, 12),
                Image(
                    image, width=480, height=min(600, 480 * h / w), kind="proportional"
                ),
            ]
        )

    def footer(canvas, doc):
        canvas.setFont("TradeLab", 8)
        canvas.setFillColor(colors.HexColor("#64748b"))
        canvas.drawString(
            48, 24, "TradeLab • Generated from the analysis shown in chat"
        )
        canvas.drawRightString(548, 24, str(doc.page))

    doc = SimpleDocTemplate(
        request["output"],
        rightMargin=48,
        leftMargin=48,
        topMargin=42,
        bottomMargin=42,
        title="TradeLab Analytics Report",
        author="TradeLab",
    )
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return {"files": [request["output"]], "tables": table_metadata}


if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        if request["action"] == "validate":
            result = {"recipe": parse_recipe(request["source"])}
        elif request["action"] == "chart":
            result = chart(request)
        elif request["action"] == "pdf":
            result = pdf(request)
        else:
            raise ValueError("Unknown operation.")
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
