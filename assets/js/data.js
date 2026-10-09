window.PACER = {
  "site": {
    "title": "PACER: Process-Aware VLA Policy Learning from Human Corrections for Robotic Disassembly",
    "short": "PACER",
    "venue": "CoRL 2026",
    "authors": [
      {
        "name": "Chang Liu",
        "affil": [
          1
        ],
        "url": null
      },
      {
        "name": "Sibo Tian",
        "affil": [
          1
        ],
        "url": null
      },
      {
        "name": "Litian Gong",
        "affil": [
          2
        ],
        "url": null
      },
      {
        "name": "Zhiwen Fan",
        "affil": [
          1
        ],
        "url": null
      },
      {
        "name": "Jiachen Li",
        "affil": [
          3
        ],
        "url": null
      },
      {
        "name": "Xiao Liang",
        "affil": [
          1
        ],
        "url": null
      },
      {
        "name": "Minghui Zheng",
        "affil": [
          1
        ],
        "url": null
      }
    ],
    "affiliations": [
      "Texas A&M University",
      "University of California, Riverside",
      "Georgia Institute of Technology"
    ],
    "affiliations_short": [
      "Texas A&M",
      "UC Riverside",
      "Georgia Tech"
    ],
    "links": {
      "paper": null,
      "arxiv": null,
      "code": "https://github.com/ChangChrisLiu/PACER"
    },
    "bibtex": null
  },
  "tldr": {
    "teleop_demos": 710,
    "autonomous_rollouts": 350,
    "max_corrections_per_component": 70,
    "collection_positions": 7,
    "components": 5,
    "heldout_trials": 100,
    "heldout_configs_per_component": 2,
    "trials_per_config": 10,
    "success": {
      "theta0": 12,
      "vanilla_post_sft": 54,
      "pacer": 87
    }
  },
  "results": {
    "components": [
      "RAM",
      "Connector",
      "CPU",
      "GPU",
      "CPU fan"
    ],
    "trials_per_component": 20,
    "methods": [
      {
        "id": "theta0",
        "label": "\u03c0_\u03b80 (no post-train)",
        "overall": 12,
        "per_component": [
          7,
          0,
          0,
          5,
          0
        ],
        "jval": 0.7214,
        "rows_used": "none",
        "desc": "supervised reference checkpoint, no post-training"
      },
      {
        "id": "vanilla_post_sft",
        "label": "Vanilla post-SFT",
        "overall": 54,
        "per_component": [
          12,
          5,
          3,
          20,
          14
        ],
        "jval": 0.7579,
        "rows_used": "clean, correction",
        "desc": "clean + correction rows, uniform weight, no gate"
      },
      {
        "id": "uniform_all_eligible",
        "label": "Uniform all-eligible",
        "overall": 64,
        "per_component": [
          16,
          3,
          8,
          20,
          17
        ],
        "jval": 0.7648,
        "rows_used": "all eligible",
        "desc": "all gate-eligible rows, uniform weight, gate on"
      },
      {
        "id": "outcome_only",
        "label": "Outcome only",
        "overall": 11,
        "per_component": [
          0,
          0,
          0,
          10,
          1
        ],
        "jval": 0.734,
        "rows_used": "clean, auto_success",
        "desc": "clean + autonomous-success rows only, uniform weight, no process evidence"
      },
      {
        "id": "clean_only",
        "label": "Clean only",
        "overall": 24,
        "per_component": [
          0,
          0,
          9,
          8,
          7
        ],
        "jval": 0.7425,
        "rows_used": "supp. clean",
        "desc": "supplementary clean demonstrations only, uniform weight, gate on"
      },
      {
        "id": "correction_only",
        "label": "Correction only",
        "overall": 0,
        "per_component": [
          0,
          0,
          0,
          0,
          0
        ],
        "jval": 0.7201,
        "rows_used": "correction",
        "desc": "human-correction rows only, uniform weight, gate on"
      },
      {
        "id": "fixed_geometry",
        "label": "Fixed geometry",
        "overall": 79,
        "per_component": [
          18,
          11,
          12,
          20,
          18
        ],
        "jval": 0.7699,
        "rows_used": "eligible, rank weight",
        "desc": "gate-eligible rows, frozen geometry-only rank weight, no validation selection"
      },
      {
        "id": "pacer",
        "label": "PACER",
        "overall": 87,
        "per_component": [
          19,
          13,
          15,
          20,
          20
        ],
        "jval": 0.7707,
        "rows_used": "eligible, positive w",
        "desc": "gate-eligible rows, process-evidence weights, validation-selected configuration"
      }
    ]
  },
  "candidates": [
    {
      "id": "rw_like",
      "label": "reweighting-like",
      "beta_prog": 0.3,
      "beta_prox": 0.45,
      "beta_term": 0.15,
      "beta_stop": 0.05,
      "gamma_corr": 1.2,
      "gamma_part": 0.6,
      "tau": 1.0,
      "w_max": 4.5,
      "jval": 0.769558,
      "selected": false
    },
    {
      "id": "progress_heavy",
      "label": "progress-heavy",
      "beta_prog": 0.55,
      "beta_prox": 0.2,
      "beta_term": 0.15,
      "beta_stop": 0.05,
      "gamma_corr": 1.2,
      "gamma_part": 0.6,
      "tau": 1.0,
      "w_max": 4.5,
      "jval": 0.76842,
      "selected": false
    },
    {
      "id": "hover_proximity_heavy",
      "label": "proximity-heavy",
      "beta_prog": 0.2,
      "beta_prox": 0.6,
      "beta_term": 0.1,
      "beta_stop": 0.05,
      "gamma_corr": 1.2,
      "gamma_part": 0.6,
      "tau": 1.0,
      "w_max": 4.5,
      "jval": 0.770343,
      "selected": false
    },
    {
      "id": "terminal_stop_heavy",
      "label": "terminal + stop evidence",
      "beta_prog": 0.2,
      "beta_prox": 0.25,
      "beta_term": 0.35,
      "beta_stop": 0.15,
      "gamma_corr": 1.2,
      "gamma_part": 0.6,
      "tau": 1.0,
      "w_max": 4.5,
      "jval": 0.77076,
      "selected": true
    },
    {
      "id": "correction_heavy",
      "label": "correction-heavy",
      "beta_prog": 0.3,
      "beta_prox": 0.45,
      "beta_term": 0.15,
      "beta_stop": 0.05,
      "gamma_corr": 1.8,
      "gamma_part": 0.7,
      "tau": 1.0,
      "w_max": 4.5,
      "jval": 0.769622,
      "selected": false
    },
    {
      "id": "conservative",
      "label": "conservative clip",
      "beta_prog": 0.3,
      "beta_prox": 0.45,
      "beta_term": 0.15,
      "beta_stop": 0.05,
      "gamma_corr": 1.2,
      "gamma_part": 0.4,
      "tau": 1.5,
      "w_max": 2.5,
      "jval": 0.769244,
      "selected": false
    },
    {
      "id": "ram_connector_recovery",
      "label": "RAM/connector recovery",
      "beta_prog": 0.45,
      "beta_prox": 0.3,
      "beta_term": 0.1,
      "beta_stop": 0.05,
      "gamma_corr": 1.7,
      "gamma_part": 0.9,
      "tau": 1.0,
      "w_max": 5.0,
      "jval": 0.768812,
      "selected": false
    },
    {
      "id": "balanced_low_clip",
      "label": "balanced, low clip",
      "beta_prog": 0.3,
      "beta_prox": 0.45,
      "beta_term": 0.15,
      "beta_stop": 0.05,
      "gamma_corr": 1.2,
      "gamma_part": 0.6,
      "tau": 0.85,
      "w_max": 3.5,
      "jval": 0.769395,
      "selected": false
    }
  ],
  "fixed": {
    "beta_op": 0.05,
    "beta_dir": 0,
    "beta_prov": 0,
    "gamma_clean": 1.0,
    "gamma_auto_success": 1.0,
    "gamma_failure": 0,
    "gamma_excluded": 0,
    "f_clean": 0.8,
    "f_corr": 0.65
  },
  "explainer": {
    "illustrative": true,
    "training_rows": 8836,
    "jval_span_bound": 0.003,
    "lane_d": 1.6,
    "traces": [
      {
        "id": "success",
        "role": "auto_success",
        "outcome": "success",
        "label": "Autonomous success",
        "tag": "success",
        "d0": 1.6,
        "chunks": [
          {
            "x": 0.0938,
            "y": -0.16,
            "d": 1.45,
            "e": {
              "prog": 0.09,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0.8
            }
          },
          {
            "x": 0.1875,
            "y": -0.306,
            "d": 1.3,
            "e": {
              "prog": 0.1,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0.8
            }
          },
          {
            "x": 0.275,
            "y": -0.418,
            "d": 1.16,
            "e": {
              "prog": 0.11,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0.8
            }
          },
          {
            "x": 0.3563,
            "y": -0.495,
            "d": 1.03,
            "e": {
              "prog": 0.11,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0.8
            }
          },
          {
            "x": 0.4313,
            "y": -0.537,
            "d": 0.91,
            "e": {
              "prog": 0.12,
              "prox": 0.09,
              "term": 0,
              "stop": 0,
              "op": 0.8
            }
          },
          {
            "x": 0.5,
            "y": -0.55,
            "d": 0.8,
            "e": {
              "prog": 0.12,
              "prox": 0.2,
              "term": 0,
              "stop": 0,
              "op": 0.8
            }
          },
          {
            "x": 0.5625,
            "y": -0.539,
            "d": 0.7,
            "e": {
              "prog": 0.13,
              "prox": 0.3,
              "term": 0,
              "stop": 0,
              "op": 0.8
            }
          },
          {
            "x": 0.6188,
            "y": -0.512,
            "d": 0.61,
            "e": {
              "prog": 0.13,
              "prox": 0.39,
              "term": 0,
              "stop": 0,
              "op": 0.8
            }
          },
          {
            "x": 0.675,
            "y": -0.469,
            "d": 0.52,
            "e": {
              "prog": 0.15,
              "prox": 0.48,
              "term": 0,
              "stop": 0,
              "op": 0.8
            }
          },
          {
            "x": 0.75,
            "y": -0.389,
            "d": 0.4,
            "e": {
              "prog": 0.23,
              "prox": 0.6,
              "term": 1,
              "stop": 0,
              "op": 0.8
            }
          },
          {
            "x": 0.8625,
            "y": -0.23,
            "d": 0.22,
            "e": {
              "prog": 0.45,
              "prox": 0.78,
              "term": 1,
              "stop": 0,
              "op": 0.8
            }
          },
          {
            "x": 1.0,
            "y": 0.0,
            "d": 0,
            "e": {
              "prog": 1.0,
              "prox": 1.0,
              "term": 1,
              "stop": 1,
              "op": 0.8
            }
          }
        ]
      },
      {
        "id": "near",
        "role": "partial",
        "outcome": "near_but_not_accurate",
        "label": "Near miss (partial)",
        "tag": "near target",
        "d0": 1.6,
        "chunks": [
          {
            "x": 0.0938,
            "y": -0.044,
            "d": 1.45,
            "e": {
              "prog": 0.09,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0.6
            }
          },
          {
            "x": 0.1875,
            "y": -0.156,
            "d": 1.3,
            "e": {
              "prog": 0.1,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0.6
            }
          },
          {
            "x": 0.275,
            "y": -0.296,
            "d": 1.16,
            "e": {
              "prog": 0.11,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0.6
            }
          },
          {
            "x": 0.3563,
            "y": -0.435,
            "d": 1.03,
            "e": {
              "prog": 0.11,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0.6
            }
          },
          {
            "x": 0.425,
            "y": -0.546,
            "d": 0.92,
            "e": {
              "prog": 0.11,
              "prox": 0.08,
              "term": 0,
              "stop": 0,
              "op": 0.6
            }
          },
          {
            "x": 0.4813,
            "y": -0.623,
            "d": 0.83,
            "e": {
              "prog": 0.1,
              "prox": 0.17,
              "term": 0,
              "stop": 0,
              "op": 0.6
            }
          },
          {
            "x": 0.525,
            "y": -0.671,
            "d": 0.76,
            "e": {
              "prog": 0.08,
              "prox": 0.24,
              "term": 0,
              "stop": 0,
              "op": 0.6
            }
          },
          {
            "x": 0.5625,
            "y": -0.7,
            "d": 0.7,
            "e": {
              "prog": 0.08,
              "prox": 0.3,
              "term": 0,
              "stop": 0,
              "op": 0.6
            }
          },
          {
            "x": 0.5875,
            "y": -0.713,
            "d": 0.66,
            "e": {
              "prog": 0.06,
              "prox": 0.34,
              "term": 0,
              "stop": 0,
              "op": 0.6
            }
          },
          {
            "x": 0.6062,
            "y": -0.718,
            "d": 0.63,
            "e": {
              "prog": 0.05,
              "prox": 0.37,
              "term": 0,
              "stop": 0,
              "op": 0.6
            }
          },
          {
            "x": 0.6188,
            "y": -0.72,
            "d": 0.61,
            "e": {
              "prog": 0.03,
              "prox": 0.39,
              "term": 0,
              "stop": 0,
              "op": 0.6
            }
          },
          {
            "x": 0.625,
            "y": -0.72,
            "d": 0.6,
            "e": {
              "prog": 0.02,
              "prox": 0.4,
              "term": 0,
              "stop": 0,
              "op": 0.6
            }
          }
        ]
      },
      {
        "id": "correction",
        "role": "correction",
        "outcome": null,
        "label": "Human correction",
        "tag": "correction",
        "d0": 1.1,
        "lead": [
          {
            "x": 0,
            "y": 0
          },
          {
            "x": 0.16,
            "y": 0.25
          },
          {
            "x": 0.3125,
            "y": 0.8
          }
        ],
        "chunks": [
          {
            "x": 0.3625,
            "y": 0.788,
            "d": 1.02,
            "e": {
              "prog": 0.07,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.4063,
            "y": 0.759,
            "d": 0.95,
            "e": {
              "prog": 0.07,
              "prox": 0.05,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.45,
            "y": 0.717,
            "d": 0.88,
            "e": {
              "prog": 0.07,
              "prox": 0.12,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.4938,
            "y": 0.663,
            "d": 0.81,
            "e": {
              "prog": 0.08,
              "prox": 0.19,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.5375,
            "y": 0.599,
            "d": 0.74,
            "e": {
              "prog": 0.09,
              "prox": 0.26,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.5813,
            "y": 0.529,
            "d": 0.67,
            "e": {
              "prog": 0.09,
              "prox": 0.33,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.625,
            "y": 0.454,
            "d": 0.6,
            "e": {
              "prog": 0.1,
              "prox": 0.4,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.6687,
            "y": 0.378,
            "d": 0.53,
            "e": {
              "prog": 0.12,
              "prox": 0.47,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.7188,
            "y": 0.292,
            "d": 0.45,
            "e": {
              "prog": 0.15,
              "prox": 0.55,
              "term": 1,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.7937,
            "y": 0.173,
            "d": 0.33,
            "e": {
              "prog": 0.27,
              "prox": 0.67,
              "term": 1,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.8875,
            "y": 0.057,
            "d": 0.18,
            "e": {
              "prog": 0.45,
              "prox": 0.82,
              "term": 1,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 1.0,
            "y": 0.0,
            "d": 0,
            "e": {
              "prog": 1.0,
              "prox": 1.0,
              "term": 1,
              "stop": 1,
              "op": 1
            }
          }
        ]
      },
      {
        "id": "clean",
        "role": "clean",
        "outcome": null,
        "label": "Clean demo",
        "tag": "clean demo",
        "d0": 1.6,
        "chunks": [
          {
            "x": 0.0813,
            "y": -0.025,
            "d": 1.47,
            "e": {
              "prog": 0.08,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.1687,
            "y": -0.051,
            "d": 1.33,
            "e": {
              "prog": 0.1,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.25,
            "y": -0.071,
            "d": 1.2,
            "e": {
              "prog": 0.1,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.3313,
            "y": -0.086,
            "d": 1.07,
            "e": {
              "prog": 0.11,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.4187,
            "y": -0.097,
            "d": 0.93,
            "e": {
              "prog": 0.13,
              "prox": 0.07,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.5,
            "y": -0.1,
            "d": 0.8,
            "e": {
              "prog": 0.14,
              "prox": 0.2,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.5813,
            "y": -0.097,
            "d": 0.67,
            "e": {
              "prog": 0.16,
              "prox": 0.33,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.6687,
            "y": -0.086,
            "d": 0.53,
            "e": {
              "prog": 0.21,
              "prox": 0.47,
              "term": 0,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.75,
            "y": -0.071,
            "d": 0.4,
            "e": {
              "prog": 0.25,
              "prox": 0.6,
              "term": 1,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.8313,
            "y": -0.051,
            "d": 0.27,
            "e": {
              "prog": 0.33,
              "prox": 0.73,
              "term": 1,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 0.9187,
            "y": -0.025,
            "d": 0.13,
            "e": {
              "prog": 0.52,
              "prox": 0.87,
              "term": 1,
              "stop": 0,
              "op": 1
            }
          },
          {
            "x": 1.0,
            "y": 0.0,
            "d": 0,
            "e": {
              "prog": 1.0,
              "prox": 1.0,
              "term": 1,
              "stop": 1,
              "op": 1
            }
          }
        ]
      },
      {
        "id": "failure",
        "role": "failure",
        "outcome": "totally_off_wrong_region_or_target",
        "label": "Failure (wrong region)",
        "tag": "wrong region",
        "d0": 1.6,
        "chunks": [
          {
            "x": 0.125,
            "y": 0.08,
            "d": 1.4,
            "e": {
              "prog": 0.13,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0
            }
          },
          {
            "x": 0.2188,
            "y": 0.2,
            "d": 1.25,
            "e": {
              "prog": 0.11,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0
            }
          },
          {
            "x": 0.2813,
            "y": 0.3,
            "d": 1.15,
            "e": {
              "prog": 0.08,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0
            }
          },
          {
            "x": 0.3438,
            "y": 0.4,
            "d": 1.05,
            "e": {
              "prog": 0.09,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0
            }
          },
          {
            "x": 0.3938,
            "y": 0.48,
            "d": 0.97,
            "e": {
              "prog": 0.08,
              "prox": 0.03,
              "term": 0,
              "stop": 0,
              "op": 0
            }
          },
          {
            "x": 0.4375,
            "y": 0.56,
            "d": 0.9,
            "e": {
              "prog": 0.07,
              "prox": 0.1,
              "term": 0,
              "stop": 0,
              "op": 0
            }
          },
          {
            "x": 0.4625,
            "y": 0.62,
            "d": 0.86,
            "e": {
              "prog": 0.04,
              "prox": 0.14,
              "term": 0,
              "stop": 0,
              "op": 0
            }
          },
          {
            "x": 0.425,
            "y": 0.72,
            "d": 0.92,
            "e": {
              "prog": 0.0,
              "prox": 0.08,
              "term": 0,
              "stop": 0,
              "op": 0
            }
          },
          {
            "x": 0.375,
            "y": 0.82,
            "d": 1.0,
            "e": {
              "prog": 0.0,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0
            }
          },
          {
            "x": 0.325,
            "y": 0.9,
            "d": 1.08,
            "e": {
              "prog": 0.0,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0
            }
          },
          {
            "x": 0.2813,
            "y": 0.95,
            "d": 1.15,
            "e": {
              "prog": 0.0,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0
            }
          },
          {
            "x": 0.2375,
            "y": 0.98,
            "d": 1.22,
            "e": {
              "prog": 0.0,
              "prox": 0.0,
              "term": 0,
              "stop": 0,
              "op": 0
            }
          }
        ]
      }
    ]
  },
  "videos": {
    "hero": {
      "src": "assets/video/hero_loop.mp4",
      "poster": "assets/img/hero_poster.jpg",
      "speed": "3\u00d7",
      "chip": "Real robot",
      "label": "Muted loop: the PACER policy on the UR5e removing, left to right, the CPU fan, the RAM and the GPU",
      "placeholder": false
    },
    "motivation": {
      "src": "assets/video/motivation_v2_1080.mp4",
      "src720": "assets/video/motivation_v2_720.mp4",
      "poster": "assets/img/motivation_v2_poster.jpg",
      "vtt": "assets/video/motivation_v2.en.vtt",
      "duration_s": 70.5,
      "version": "v2",
      "vtt_text": "WEBVTT\n\n00:00:01.000 --> 00:00:02.920\nImagine how you learn in school.\n\n00:00:02.960 --> 00:00:05.800\nOne teacher gives the same\ndemonstration to everyone.\n\n00:00:05.900 --> 00:00:09.740\nDuring the lesson, different students\nmay all look like they fully understand.\n\n00:00:10.000 --> 00:00:14.100\nHowever, the actual performance can\nonly be tested beyond the lecture.\n\n00:00:14.100 --> 00:00:18.540\nLet's pick student A, give a real exam\non the same task and watch the rollouts.\n\n00:00:20.800 --> 00:00:23.320\nHow can we improve\nstudent A's performance?\n\n00:00:23.400 --> 00:00:24.920\nGive more demonstrations?\n\n00:00:24.940 --> 00:00:26.360\nTell only yes or no.\n\n00:00:26.360 --> 00:00:28.540\nOr give an overall reward score.\n\n00:00:28.700 --> 00:00:32.460\nBut a score without step info\nmight confuse the student.\n\n00:00:32.800 --> 00:00:36.160\nThe reward may work after\ntuning between A and teacher.\n\n00:00:36.200 --> 00:00:39.700\nBut when using the same method\nfor B or C, it may not work.\n\n00:00:39.900 --> 00:00:43.380\nIn school, teachers do not set\nrewards differently for everyone.\n\n00:00:43.420 --> 00:00:45.400\nThey set a standard trial evaluation.\n\n00:00:46.000 --> 00:00:48.660\nNow consider the same idea in robotics.\n\n00:00:48.660 --> 00:00:53.020\nEach VLA model is a different student to\nlearn from the teacher's demonstrations.\n\n00:00:53.160 --> 00:00:56.520\nWe should also evaluate its\nperformance through multiple trials.\n\n00:00:56.900 --> 00:01:01.400\nInspired by human education, we are\nconsidering the same for robotic learning.\n\n00:01:01.520 --> 00:01:04.900\nLearn from useful rollouts and\ncorrections and avoid bad behaviors\n\n00:01:04.900 --> 00:01:08.080\nwhile preserving each model's\nlearning and behavior.\n"
    }
  },
  "demos": [
    {
      "group": "collection",
      "title": "Data-collection loop",
      "note": "One collection cycle: autonomous rollout, operator correction, return home, supplementary clean demonstration.",
      "flow": {
        "_": "The author's slide-4 flowchart. {key} in a note is a tldr number. The clip's phases (slot.phases) light the steps as it plays.",
        "steps": [
          {
            "id": "teleop",
            "title": "Original data collection",
            "note": "{teleop_demos} teleoperated demonstrations",
            "role": "neutral"
          },
          {
            "id": "sft",
            "title": "Supervised fine-tuning of the VLA (\u03c0_0.5)",
            "role": "neutral"
          },
          {
            "id": "rollout",
            "title": "Rollout trials",
            "note": "{autonomous_rollouts} autonomous rollouts",
            "role": "neutral"
          },
          {
            "id": "success",
            "title": "Success",
            "note": "kept as a trace",
            "role": "success",
            "branch": "success"
          },
          {
            "id": "failure",
            "title": "Failure",
            "note": "near, wrong or off",
            "role": "failure",
            "branch": "failure"
          },
          {
            "id": "correction",
            "title": "Human correction",
            "note": "\u2264 {max_corrections_per_component} per component, {collection_positions} positions",
            "role": "correction",
            "branch": "failure"
          },
          {
            "id": "home",
            "title": "Return to home",
            "role": "home",
            "branch": "failure"
          },
          {
            "id": "clean",
            "title": "Clean demonstration",
            "note": "by the operator",
            "role": "clean",
            "branch": "failure"
          }
        ]
      },
      "slots": [
        {
          "label": "Rollout \u2192 correction \u2192 home \u2192 clean demo",
          "src": "assets/video/demo_collection_loop.mp4",
          "poster": "assets/img/demo_collection_poster.jpg",
          "speed": "4\u00d7",
          "aspect": "9:16",
          "phases": [
            {
              "step": "rollout",
              "from": 0
            },
            {
              "step": "correction",
              "from": 4.067,
              "via": [
                "failure"
              ]
            },
            {
              "step": "home",
              "from": 6.667
            },
            {
              "step": "clean",
              "from": 8.967
            }
          ]
        }
      ]
    },
    {
      "group": "demo1",
      "title": "PACER vs. direct post-training",
      "note": "CPU fan and RAM, for the initial SFT policy, vanilla post-SFT, and PACER. One representative trial per method; success rates over all held-out trials are in Results.",
      "slots": [
        {
          "set": "CPU fan",
          "label": "\u03c0_\u03b80 (initial SFT)",
          "src": "assets/video/demo_cpufan_initial.mp4",
          "poster": "assets/img/demo_cpufan_initial_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16",
          "outcome": "Failed"
        },
        {
          "set": "CPU fan",
          "label": "Vanilla post-SFT",
          "src": "assets/video/demo_cpufan_vanilla.mp4",
          "poster": "assets/img/demo_cpufan_vanilla_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16",
          "outcome": "Success"
        },
        {
          "set": "CPU fan",
          "label": "PACER",
          "src": "assets/video/demo_cpufan_pacer.mp4",
          "poster": "assets/img/demo_cpufan_pacer_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16",
          "outcome": "Success"
        },
        {
          "set": "RAM",
          "label": "\u03c0_\u03b80 (initial SFT)",
          "src": "assets/video/demo_ram_initial.mp4",
          "poster": "assets/img/demo_ram_initial_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16",
          "outcome": "Failed"
        },
        {
          "set": "RAM",
          "label": "Vanilla post-SFT",
          "src": "assets/video/demo_ram_vanilla.mp4",
          "poster": "assets/img/demo_ram_vanilla_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16",
          "outcome": "Close"
        },
        {
          "set": "RAM",
          "label": "PACER",
          "src": "assets/video/demo_ram_pacer.mp4",
          "poster": "assets/img/demo_ram_pacer_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16",
          "outcome": "Success"
        }
      ]
    },
    {
      "group": "demo2",
      "title": "PACER vs. outcome-only and fixed geometry",
      "note": "CPU fan and RAM, for outcome-only, fixed-geometry, and PACER post-training. One representative trial per method; success rates over all held-out trials are in Results.",
      "slots": [
        {
          "set": "CPU fan",
          "label": "Outcome only",
          "src": "assets/video/demo_cpufan_outcome.mp4",
          "poster": "assets/img/demo_cpufan_outcome_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16",
          "outcome": "Failed"
        },
        {
          "set": "CPU fan",
          "label": "Fixed geometry",
          "src": "assets/video/demo_cpufan_fixedgeo.mp4",
          "poster": "assets/img/demo_cpufan_fixedgeo_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16",
          "outcome": "Success"
        },
        {
          "set": "CPU fan",
          "label": "PACER",
          "src": "assets/video/demo_cpufan_pacer.mp4",
          "poster": "assets/img/demo_cpufan_pacer_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16",
          "outcome": "Success"
        },
        {
          "set": "RAM",
          "label": "Outcome only",
          "src": "assets/video/demo_ram_outcome.mp4",
          "poster": "assets/img/demo_ram_outcome_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16",
          "outcome": "Failed"
        },
        {
          "set": "RAM",
          "label": "Fixed geometry",
          "src": "assets/video/demo_ram_fixedgeo.mp4",
          "poster": "assets/img/demo_ram_fixedgeo_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16",
          "outcome": "Close"
        },
        {
          "set": "RAM",
          "label": "PACER",
          "src": "assets/video/demo_ram_pacer.mp4",
          "poster": "assets/img/demo_ram_pacer_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16",
          "outcome": "Success"
        }
      ]
    },
    {
      "group": "all_components",
      "title": "PACER on all five components",
      "note": "The selected PACER policy on each of the five components, plus the CPU in an unseen configuration.",
      "slots": [
        {
          "label": "CPU fan",
          "src": "assets/video/demo_comp_cpufan.mp4",
          "poster": "assets/img/demo_comp_cpufan_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16"
        },
        {
          "label": "RAM",
          "src": "assets/video/demo_comp_ram.mp4",
          "poster": "assets/img/demo_comp_ram_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16"
        },
        {
          "label": "Connector",
          "src": "assets/video/demo_comp_connector.mp4",
          "poster": "assets/img/demo_comp_connector_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16"
        },
        {
          "label": "GPU",
          "src": "assets/video/demo_comp_gpu.mp4",
          "poster": "assets/img/demo_comp_gpu_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16"
        },
        {
          "label": "CPU",
          "src": "assets/video/demo_comp_cpu.mp4",
          "poster": "assets/img/demo_comp_cpu_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16"
        },
        {
          "label": "CPU \u00b7 unseen configuration",
          "src": "assets/video/demo_comp_cpu_unseen.mp4",
          "poster": "assets/img/demo_comp_cpu_unseen_poster.jpg",
          "speed": "3\u00d7",
          "aspect": "9:16"
        }
      ]
    }
  ]
};
