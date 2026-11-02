from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def home(_request):
    return JsonResponse(
        {
            "app": "Spotter Corridor",
            "status": "ok",
            "health": "/api/health/",
            "analyze": "POST /api/analyze/",
            "heatmap": "POST /api/heatmap/",
        }
    )


urlpatterns = [
    path("", home),
    path("admin/", admin.site.urls),
    path("api/", include("routing.urls")),
]