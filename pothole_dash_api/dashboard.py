import base64
import io

import dash
from dash import Input, Output, State, dcc, html
import plotly.graph_objects as go
import requests


API_URL = "http://127.0.0.1:5000/predict"

app = dash.Dash(__name__)
app.title = "Pothole classifier"

app.layout = html.Div(
    style={"maxWidth": 900, "margin": "24px auto", "fontFamily": "Arial"},
    children=[
        html.H2("Pothole classifier (API Flask + Dash)"),
        html.Div(
            style={"color": "#555", "marginBottom": 12},
            children="Uploade une image, puis clique Predict. Le dashboard appelle l'API Flask /predict.",
        ),
        dcc.Upload(
            id="upload",
            children=html.Div(["Glisse l'image ici ou ", html.A("clique pour choisir")]),
            style={
                "width": "100%",
                "height": "90px",
                "lineHeight": "90px",
                "borderWidth": "1px",
                "borderStyle": "dashed",
                "borderRadius": "10px",
                "textAlign": "center",
                "marginBottom": "12px",
            },
            multiple=False,
        ),
        html.Button("Predict", id="btn", style={"padding": "10px 14px"}),
        html.Div(id="err", style={"color": "#b00020", "marginTop": 10}),
        html.Div(
            style={"display": "grid", "gridTemplateColumns": "1fr 1fr", "gap": 16, "marginTop": 16},
            children=[
                html.Div(
                    children=[
                        html.H4("Image"),
                        html.Img(id="preview", style={"maxWidth": "100%", "borderRadius": 10, "border": "1px solid #eee"}),
                    ]
                ),
                html.Div(
                    children=[
                        html.H4("Prediction"),
                        html.Pre(id="pred_text", style={"background": "#fafafa", "padding": 12, "borderRadius": 10}),
                        dcc.Graph(id="pred_bar", figure=go.Figure(), config={"displayModeBar": False}),
                    ]
                ),
            ],
        ),
        dcc.Store(id="stored_image_bytes"),
    ],
)


def _decode_upload(contents: str) -> bytes:
    # contents: "data:image/...;base64,AAA..."
    _, b64 = contents.split(",", 1)
    return base64.b64decode(b64)


@app.callback(
    Output("preview", "src"),
    Output("stored_image_bytes", "data"),
    Output("err", "children"),
    Input("upload", "contents"),
    prevent_initial_call=True,
)
def on_upload(contents):
    if not contents:
        return dash.no_update, dash.no_update, ""
    try:
        img_bytes = _decode_upload(contents)
        return contents, base64.b64encode(img_bytes).decode("utf-8"), ""
    except Exception as e:
        return "", None, f"Upload decode error: {e}"


@app.callback(
    Output("pred_text", "children"),
    Output("pred_bar", "figure"),
    Output("err", "children"),
    Input("btn", "n_clicks"),
    State("stored_image_bytes", "data"),
    prevent_initial_call=True,
)
def on_predict(_, stored_b64):
    if not stored_b64:
        return "", go.Figure(), "Aucune image. Uploade d'abord une image."

    try:
        img_bytes = base64.b64decode(stored_b64.encode("utf-8"))
        files = {"image": ("image.jpg", io.BytesIO(img_bytes), "image/jpeg")}
        r = requests.post(API_URL, files=files, timeout=30)
        data = r.json()
        if r.status_code != 200:
            return "", go.Figure(), f"API error: {data}"

        topk = data.get("topk", [])
        label = data.get("label")
        prob = data.get("prob")

        txt = f"label: {label}\nprob: {prob:.4f}\n\nTopK:\n" + "\n".join(
            [f"- {t['label']}: {t['prob']:.4f}" for t in topk]
        )

        fig = go.Figure()
        if topk:
            fig.add_bar(x=[t["label"] for t in topk], y=[t["prob"] for t in topk])
            fig.update_layout(
                yaxis=dict(range=[0, 1]),
                margin=dict(l=10, r=10, t=10, b=10),
                height=280,
            )

        return txt, fig, ""
    except Exception as e:
        return "", go.Figure(), f"Predict error: {e}"


if __name__ == "__main__":
    app.run(debug=True, port=8050)

