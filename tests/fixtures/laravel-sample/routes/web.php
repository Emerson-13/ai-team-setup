<?php
Route::get('/', [HomeController::class, 'index']);
Route::middleware('auth')->group(function () {
    Route::resource('bookings', BookingController::class);
    Route::post('/bookings/{booking}/cancel', [BookingController::class, 'cancel']);
});
Route::view('/about', 'about');
